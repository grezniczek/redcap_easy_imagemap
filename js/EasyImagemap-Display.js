// Easy Imagemap EM
// @ts-check
;(function() {

// @ts-ignore
const EIM = window.DE_RUB_EasyImagemap ?? {
    init: initialize
};
// @ts-ignore
window.DE_RUB_EasyImagemap = EIM;

var config = {};
const retryCount = 5;
const retryTime = 100;
let EIM_radioResetVal = null;

function initialize(config_data) {
    config = config_data;
    log('Initialzing ...', config);

    for (const mapField in config.maps) {
        try {
            addMap(mapField, config.maps[mapField], retryCount);
        }
        catch(ex) {
            error('Failed to setup map for field \'' + mapField + '\'.', ex);
        }
    }
    log('Initializiation complete.');
}


/**
 * Sets up an imagemap for a descriptive field with an image
 * @param {string} field 
 * @param {object} map 
 * @param {Number} retry 
 */
function addMap(field, map, retry) {
    // Locate the field/image - this may take some retries
    const query = 'img[lsrc*="' + map.hash + '"]';
    const $img = $(query);
    if ($img.length != 1) {
        if (retry > 0) {
            setTimeout(function() {
                addMap(field, map, retry - 1);
            }, retryTime);
        }
        else {
            error('Could not locate the field \'' + field + '\' or its image.', query);
        }
        return;
    }
    // Build SVG to overlay on image - we need to wrap the image first
    const $wrapper = $img.wrap('<div style="position:relative;"></div>').css('max-width','100%').css('height','auto').parent();
    const $svg = $('<svg tabindex="0" data-imagemap-id="eim-' + map.hash + '" style="display:none;position:absolute;top:0;left:0" height="' + map.bounds.height + 'px" width="' + map.bounds.width + 'px" viewBox="0 0 ' + map.bounds.width + ' ' + map.bounds.height + '"></svg>');
    $wrapper.append($svg);
    const svg = $svg[0];
    // Add the areas and styles
    const styles = [];
    for (const areaIdx in map.areas) {
        const id = 'eim-'+generateUUID();
        const area = map.areas[areaIdx];
        const type = config.targets[area.target];
        const poly = createSVG('polygon', { 
            points: area.points,
            id: id,
            'data-target': area.target
        });
        poly.addEventListener('pointerdown', function(e) { setTargetValue(field, id, type, area.target, area.code); });

        styles.push(
            '#' + id + ' {stroke-widht:1;stroke:orange;fill:orange;opacity:0.01;cursor:pointer;}\n' + 
            '#' + id + ':hover {opacity:0.1;}\n' + 
            '#' + id + '.selected {opacity:0.4;}\n'
        );
        svg.append(poly);
        if (checkTargetValue(type, area.target, area.code)) {
            poly.classList.add('selected');
        }
        if (map['two-way']) {
            setupTwoWayBinding(field, id, type, area.target, area.code);
            if (EIM_radioResetVal == null) {
                // Hijack radioResetVal
                // @ts-ignore
                EIM_radioResetVal = window.radioResetVal;
                // @ts-ignore
                window.radioResetVal = function (this_field, this_form) {
                    EIM_radioResetVal(this_field, this_form);
                    twoWayRadioReset(this_field);
                }
            }
        }
    }
    $('body').append('<style>' + styles.join('') + '</style>')
    // Show the SVG overlay once the image has completed loading (otherwise, the imagemap might show first)
    $img.one('load', function() {
        $svg.show();
    }).each(function() {
        // In case the image was already completed, we need to trigger the load event
        // @ts-ignore
        if (this.complete) {
            $img.trigger('load');
        }
    });
    // Hide the SVG to prevent the overlay from showing while the image is already gone 
    $(window).on('beforeunload', function() {
        $svg.hide();
    });
    log('Set up field \'' + field + '\' (after ' + (retryCount - retry) + ' retries):', map, $img, $svg);
}

function checkTargetValue(type, target, code) {
    let val = '';
    switch (type) {
        case 'checkbox': {
            val = ($('input[name="__chk__' + target + '_RC_' + code + '"]').val() ?? '').toString();
        }
        break;
        case 'yesno':
        case 'truefalse':
        case 'radio': {
            val = document.forms['form'][target].value;
        }
        break;
        case 'select': {
            
        }
        break;
    }
    log('Checking target value for ' + target + '(' + code + ') (type: ' + type + '): [' + val + ']');
    return val == code;
}

function updateAreaClass(field, id, type, target, code) {
    log('Updating area', field, target, code);
    if (['yesno','truefalse','radio'].includes(type)) {
        // Unselect all for same target in case of mutually exclusive types
        $('#'+ id).siblings('[data-target="' + target + '"]').each(function() {
            this.classList.remove('selected');
        });
    }
    setTimeout(function() {
        $('#' + id)[0].classList[checkTargetValue(type, target, code) ? 'add' : 'remove']('selected');
    }, 0);
}

function setTargetValue(field, id, type, target, code) {
    switch (type) {
        case 'checkbox': {
            $('#id-__chk__' + target + '_RC_' + code).trigger('click');
            updateAreaClass(field, id, type, target, code);
        }
        break;
        case 'yesno':
        case 'truefalse':
        case 'radio': {
            if (code == '') {
                // @ts-ignore
                radioResetVal(target, 'form');
                document.forms['form'][target].value = '';
            }
            else {
                $('#opt-' + target + '_' + code).trigger('click');
            }
            updateAreaClass(field, id, type, target, code);
        }
        break;
        case 'select': {

        }
        break;
    }
}

const twoWayRadioResetData = {};

function setupTwoWayBinding(field, id, type, target, code) {
    switch (type) {
        case 'checkbox': {
            const $el = $('input[name="__chk__' + target + '_RC_' + code + '"]')
            $el.on('change', function() {
                updateAreaClass(field, id, type, target, code);
            });
            trackChange($el[0], 'value');
        }
        break;
        case 'yesno':
        case 'truefalse':
        case 'radio': {
            if (code != '') {
                const $el = $('input[type="radio"][name="' + target + '___radio"]');
                $el.on('change', function() {
                    updateAreaClass(field, id, type, target, code);
                });
            }
            else {
                if (typeof twoWayRadioResetData[target] == 'undefined') twoWayRadioResetData[target] = {};
                if (typeof twoWayRadioResetData[target][field] == 'undefined') twoWayRadioResetData[target][field] = {};
                twoWayRadioResetData[target][field][id] = {
                    type: type,
                    code: code,
                };
            }
        }
        break;
    }
}

function twoWayRadioReset(target) {
    log('Radio reset logic:', twoWayRadioResetData, target);
    if (typeof twoWayRadioResetData[target] != 'undefined') {
        for (const field in twoWayRadioResetData[target]) {
            for (const id in twoWayRadioResetData[target][field]) {
                const code = twoWayRadioResetData[target][field][id].code;
                const type = twoWayRadioResetData[target][field][id].type;
                document.forms['form'][target].value = '';
                updateAreaClass(field, id, type, target, code);
            }
        }
    }
}

function trackChange(el, attributeName = 'value') {
    // @ts-ignore
    const MO = window.MutationObserver || window.WebKitMutationObserver;
    const observer = new MO(function(mutations, observer) {
        if(mutations[0].attributeName == attributeName) {
            log('Mutation triggered', el)
            $(el).trigger('change');
        }
    });
    observer.observe(el, { attributes: true });
}

function setPolyStyle(poly, styles) {
    for (const key in styles) {
        poly.setAttribute(key, styles[key]);
    }
}

function createSVG(tag, attrs) {
    const el= document.createElementNS('http://www.w3.org/2000/svg', tag);
    setPolyStyle(el, attrs);
    return el;
}

function generateUUID() {
    var d1 = new Date().getTime(); //Timestamp
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0; //Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var rnd = Math.random() * 16; // Random number between 0 and 16
        if(d1 > 0) { // Use timestamp until depleted
            rnd = (d1 + rnd)%16 | 0;
            d1 = Math.floor(d1/16);
        } else { // Use microseconds since page-load if supported
            rnd = (d2 + rnd)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? rnd : (rnd & 0x3 | 0x8)).toString(16);
    });
}

//#region -- Debug Logging

/**
 * Logs a message to the console when in debug mode
 */
 function log() {
    if (!config.debug) return;
    var ln = '??';
    try {
        var line = ((new Error).stack ?? '').split('\n')[2];
        var parts = line.split(':');
        ln = parts[parts.length - 2];
    }
    catch(err) { }
    log_print(ln, 'log', arguments);
}
/**
 * Logs a warning to the console when in debug mode
 */
function warn() {
    if (!config.debug) return;
    var ln = '??';
    try {
        var line = ((new Error).stack ?? '').split('\n')[2];
        var parts = line.split(':');
        ln = parts[parts.length - 2];
    }
    catch(err) { }
    log_print(ln, 'warn', arguments);
}

/**
 * Logs an error to the console when in debug mode
 */
function error() {
    var ln = '??';
    try {
        var line = ((new Error).stack ?? '').split('\n')[2];
        var parts = line.split(':');
        ln = parts[parts.length - 2];
    }
    catch(err) { }
    log_print(ln, 'error', arguments);;
}

/**
 * Prints to the console
 * @param {string} ln Line number where log was called from
 * @param {'log'|'warn'|'error'} mode
 * @param {IArguments} args
 */
function log_print(ln, mode, args) {
    var prompt = 'EasyImagemap v' + config.version + ' [' + ln + ']';
    switch(args.length) {
        case 1:
            console[mode](prompt, args[0]);
            break;
        case 2:
            console[mode](prompt, args[0], args[1]);
            break;
        case 3:
            console[mode](prompt, args[0], args[1], args[2]);
            break;
        case 4:
            console[mode](prompt, args[0], args[1], args[2], args[3]);
            break;
        case 5:
            console[mode](prompt, args[0], args[1], args[2], args[3], args[4]);
            break;
        case 6:
            console[mode](prompt, args[0], args[1], args[2], args[3], args[4], args[5]);
            break;
        default:
            console[mode](prompt, args);
            break;
    }
}

//#endregion

})();