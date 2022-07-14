// Easy Imagemap EM
// Dr. Günther Rezniczek, Ruhr-Universität Bochum, Marien Hospital Herne
// @ts-check
;(function() {

//#region Init global object and define local variables

// @ts-ignore
const EIM = window.DE_RUB_EasyImagemap ?? {
    init: initialize
};
// @ts-ignore
window.DE_RUB_EasyImagemap = EIM;

/** Configuration data supplied from the server */
let config = {};

/** Maximum number of attempts to obtain a reference to a map's <img> element */
const retryCount = 5;

/** Amount of milliseconds between retries when trying to get a reference to a map's <img> element */
const retryTime = 100;

/** Original 'radioResetVal()' function */
let EIM_radioResetVal = null;

/** Original 'saveLocking()' function */
let EIM_saveLocking = null;

/** Holds data required for two-way data binding */
const twoWayRadioResetData = {};

//#endregion

/**
 * Implements the public init method.
 * Sets config and calls the logic to wire up each image map.
 * @param {object} config_data 
 */
function initialize(config_data) {
    config = config_data;
    log('Initialzing ...', config);
    const startTime = performance.now();
    // Initialize all maps
    for (const mapField in config.maps) {
        try {
            addMap(mapField, config.maps[mapField], retryCount);
        }
        catch(ex) {
            error('Failed to setup map for field \'' + mapField + '\'.', ex);
        }
    }
    // Add interactions with form elements
    addInteractivity();
    // Hook into form locking logic
    if (typeof window['saveLocking'] != 'undefined') {
        EIM_saveLocking = window['saveLocking'];
        window['saveLocking'] = function(lock_action, esign_action) { 
            EIM_saveLocking(lock_action, esign_action);
            if (lock_action = '0') {
                setTimeout(function() {
                    addInteractivity();
                }, 100);
            }
        };
    }
    const endTime = performance.now();
    const duration = endTime - startTime;
    log('Initializiation complete (' + duration.toFixed(1) + 'ms).');
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
    log('Setting up field \'' + field + '\' (after ' + (retryCount - retry) + ' retries):', map);

    // Build SVG to overlay on image - we need to wrap the image first
    const $wrapper = $img.wrap('<div style="position:relative;"></div>').css('max-width','100%').css('height','auto').parent();
    const $svg = $('<svg data-field="' + field + '" tabindex="0" data-imagemap-id="eim-' + map.hash + '" style="display:none;position:absolute;top:0;left:0" height="' + map.bounds.height + 'px" width="' + map.bounds.width + 'px" viewBox="0 0 ' + map.bounds.width + ' ' + map.bounds.height + '"></svg>');
    $wrapper.append($svg);
    const svg = $svg[0];
    // Add the areas and styles
    const styles = [];
    for (const areaIdx in map.areas) {
        const id = 'eim-'+generateUUID();
        const area = map.areas[areaIdx];
        area.id = id;
        const type = config.targets[area.target];
        const poly = createSVG('polygon', { 
            points: area.points,
            id: id,
            'data-target': area.target,
            'data-code': area.code,
        });

        styles.push(
            '#' + id + ' {stroke-widht:1;stroke:orange;fill:orange;opacity:0.01;cursor:pointer;}\n' + 
            '#' + id + ':hover {opacity:0.1;}\n' + 
            '#' + id + '.selected {opacity:0.4;}\n'
        );
        svg.append(poly);
        if (checkTargetValue(type, area.target, area.code)) {
            poly.classList.add('selected');
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
}

/**
 * Updates an area (adds or removes the 'selected' class)
 * @param {string} field 
 * @param {string} id 
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 */
function updateAreaClass(field, id, type, target, code) {
    log('Updating area', field, target, code);
    if (['yesno','truefalse','radio','select'].includes(type)) {
        // Unselect all for same target in case of mutually exclusive types
        $('svg[data-field="' + field + '"] polygon[data-target="' + target + '"]').each(function() {
            this.classList.remove('selected');
        });
    }
    if ((id ?? '').length > 0) {
        setTimeout(function() {
            $('#' + id)[0].classList[checkTargetValue(type, target, code) ? 'add' : 'remove']('selected');
        }, 0);
    }
}

/**
 * Creates an SVG element and sets its attributes
 * @param {string} tag 
 * @param {Object<string,string>} attrs 
 * @returns {SVGElement}
 */
function createSVG(tag, attrs) {
    const el= document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const key in attrs) {
        el.setAttribute(key, attrs[key]);
    }
    return el;
}

//#region Basic Form Interaction

/**
 * Adds interactive features, i.e. binding to checkboxes, radio buttons, dropdowns
 */
function addInteractivity() {
    for (const field in config.maps) {
        try {
            const map = config.maps[field];
            for (const areaIdx in map.areas) {
                const area = map.areas[areaIdx];
                const id = area.id;
                const type = config.targets[area.target];
                if (!checkTargetDisabled(type, area.target, area.code)) {
                    setupInteractivity(field, id, type, area.target, area.code, map['two-way']);
                }
            }
        }
        catch(ex) {
            error('Failed to add interactive features for map field \'' + field + '\'.', ex);
        }
    }
}

/**
 * Sets up interactive features for a single area of a map
 * @param {string} field 
 * @param {string} id 
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 * @param {boolean} twoWay Whether to enable two-way binding (changing input elements updates the map)
 */
function setupInteractivity(field, id, type, target, code, twoWay) {
    const poly = $('#' + id)[0];
    poly.addEventListener('pointerdown', function(e) { setTargetValue(field, id, type, target, code); });
    if (twoWay) {
        setupTwoWayBinding(field, id, type, target, code);
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

/**
 * Checks the value associated with an imagemap area
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 * @returns {boolean} Indicates whether the area should be selected
 */
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
            val = ($('select[name="' + target + '"]').val() ?? '').toString();
        }
        break;
    }
    log('Checking target value for ' + target + '(' + code + ') (type: ' + type + '): [' + val + ']');
    return val == code;
}

/**
 * Checks whether the target is disabled
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 * @returns {boolean}
 */
function checkTargetDisabled(type, target, code) {
    switch (type) {
        case 'checkbox': {
            return $('input[name="__chk__' + target + '_RC_' + code + '"]').prop('disabled');
        }
        case 'yesno':
        case 'truefalse':
        case 'radio': {
            if (code == '') {
                // Special handling of reset link - check any option instead
                return  $('input[id*="opt-' + target + '_"]').prop('disabled');
            }
            return $('#opt-' + target + '_' + code).prop('disabled');
        }
        case 'select': {
            return $('select[name="' + target + '"]').prop('disabled');
        }
    }
    return true;
}

/**
 * Updates a form value after an area has been clicked.
 * This works by first triggering an click on the respective target control and then
 * updating the area based on the target control's value.
 * @param {string} field 
 * @param {string} id 
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 */
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
            const $select = $('select[name="' + target + '"]');
            $select.val(code);
            // In case this is an autocomplete dropdown, set the value of the text input
            const text = $select.find('option[value="' + code + '"]').text();
            $('#rc-ac-input_' + target).val(text);
            updateAreaClass(field, id, type, target, code);
        }
        break;
    }
}

//#endregion

//#region Two-Way Binding

/**
 * Adds two-way binding between map areas and form elements
 * @param {string} field 
 * @param {string} id 
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 */
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
        case 'select': {
            const $el = $('select[name="' + target + '"]');
            const bound = $el.attr('data-two-way-bound') ?? '';
            // Already bound?
            if (!bound.includes(':' + field)) {
                // Note that binding has been established
                $el.attr('data-two-way-bound', bound + ':' + field);
                $el.on('change', function() {
                    const $svg = $('svg[data-field="' + field + '"]');
                    const this_target = ($el.attr('name') ?? '').toString();
                    const this_code = ($el.val() ?? '').toString();
                    const this_id = $svg.find('polygon[data-target="' + this_target + '"][data-code="' + this_code + '"]').attr('id') ?? ''
                    updateAreaClass(field, this_id, type, this_target, this_code);
                });
            }
        }
        break;
    }
}

/**
 * Helper function to apply two-way binding for 'reset' links
 * @param {string} target 
 */
function twoWayRadioReset(target) {
    log('Applying a radio reset', twoWayRadioResetData, target);
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

/**
 * Sets up a MutationObserver to track changes of hidden elements
 * @param {HTMLElement} el 
 * @param {string} attributeName 
 */
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

//#endregion

//#region Helpers

/**
 * Generates a UUID
 * @returns {string}
 */
function generateUUID() {
    let d1 = new Date().getTime(); //Timestamp
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0; //Time in microseconds since page-load or 0 if unsupported
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let rnd = Math.random() * 16; // Random number between 0 and 16
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

//#endregion

//#region Debug Logging

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