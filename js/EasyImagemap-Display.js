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

/** Original 'fitImg()' function */
let EIM_fitImg = null;

/** Holds data required for two-way data binding */
const twoWayRadioResetData = {};

//#endregion

/**
 * Implements the public init method.
 * Sets config and calls the logic to wire up each image map.
 * @param {object} config_data 
 * @param {object} jsmo
 */
function initialize(config_data, jsmo) {
    config = config_data;
    config.JSMO = jsmo;
    log('Initialzing ...', config);
    
    // Initialize image maps in the afterRender callback of the JSMO
    jsmo.afterRender(function() {
        const startTime = performance.now();
        for (const mapField in config.maps) {
            try {
                setupAddMap(mapField, config.maps[mapField], retryCount);
            }
            catch(ex) {
                error('Failed to setup map for field \'' + mapField + '\'.', ex);
            }
        }
        const endTime = performance.now();
        const duration = endTime - startTime;
        log('Initializiation complete (' + duration.toFixed(1) + 'ms).');
    });

    // Hook into image fitting
    if (typeof window['fitImg'] != 'undefined') {
        EIM_fitImg = window['fitImg'];
        window['fitImg'] = function(img) { 
            EIM_fitImg(img);
            const lsrc = img.getAttribute('lsrc');
            const url = new URL('https://fake.url' + lsrc);
            const hash = url.searchParams.get('doc_id_hash') ?? '';
            const field = config.hashes[hash] ?? '';
            if (field) {
                log('Adding map for: ' + field);
                addMap(field, config.maps[field], $(img));
            }
        };
    }

    // Hook into form locking logic - Not sure why this was needed.
    if (typeof window['saveLocking'] != 'undefined') {
        EIM_saveLocking = window['saveLocking'];
        window['saveLocking'] = function(lock_action, esign_action) { 
            EIM_saveLocking(lock_action, esign_action);
            if (lock_action = '0') {
                setTimeout(function() {
                    for (const mapField in config.maps) {
                        addInteractivity(mapField);
                    }
                }, 100);
            }
        };
    }
}

/**
 * Sets up an imagemap for a descriptive field with an image
 * @param {string} field 
 * @param {object} map 
 * @param {Number} retry 
 */
function setupAddMap(field, map, retry) {
    // Locate the field/image - this may take some retries - although it should not now with hooking into fitImg().
    const query = 'img[lsrc*="' + map.hash + '"]';
    const $img = $(query);
    if ($img.length != 1) {
        if (retry > 0) {
            setTimeout(function() {
                setupAddMap(field, map, retry - 1);
            }, retryTime);
        }
        else {
            error('Could not locate the field \'' + field + '\' or its image.', query);
        }
        return;
    }
    log('Setting up field \'' + field + '\' (after ' + (retryCount - retry) + ' retries):', map);
}

/**
 * Adds an SVG overlay to the image
 * @param {string} field 
 * @param {Object} map 
 * @param {JQuery<HTMLElement>} $img 
 */
function addMap(field, map, $img) {
    // Build <svg> to overlay on the image - we need to wrap the image first
    const $wrapper = $img.wrap('<div class="eim-wrapper""></div>').parent();
    const svg = createSVG('svg', {
        width: map.bounds.width,
        height: map.bounds.height,
        'data-field': field,
        'data-imagemap-id': 'eim-' + map.hash,
        tabindex: '0',
        viewBox: '0 0 ' + map.bounds.width + ' ' + map.bounds.height,
        style: 'display: none;'
    });
    $wrapper.append(svg);
    // Add the areas and styles
    const styles = [];
    for (const areaIdx in map.areas) {
        const id = 'eim-'+generateUUID();
        const area = map.areas[areaIdx];
        area.id = id;
        const targetType = config.targets[area.target];
        let shape = null;
        if (area.poly) {
            shape = createSVG('polygon', { 
                points: area.poly,
                id: id
            });
        }
        // TODO: other shape types
        if (shape == null) {
            // No shape - remove
            map.areas.splice(areaIdx, 1);
        }
        else {
            styles.push(
                '#' + id + ' {stroke-width:1;stroke:orange;fill:orange;opacity:0.05;cursor:pointer;}\n' + 
                '#' + id + ':hover {opacity:0.2;}\n' + 
                '#' + id + '.selected {opacity:0.4;}\n'
            );
            svg.append(shape);
            if (checkTargetValue(targetType, area.target, area.code)) {
                shape.classList.add('selected');
            }
        }
    }
    $('body').append('<style>' + styles.join('') + '</style>')
    // Hide the SVG to prevent the overlay from showing while the image is already gone 
    $(window).on('beforeunload', function() {
        svg.remove();
    });
    addInteractivity(field);
    svg.style.display = 'block';
}

/**
 * Updates an area (adds or removes the 'selected' class)
 * @param {string} field 
 * @param {string} id 
 * @param {string} targetType 
 * @param {string} target 
 * @param {string} code 
 */
function updateAreaClass(field, id, targetType, target, code) {
    log('Updating area', field, target, code);
    if (['yesno','truefalse','radio','select'].includes(targetType)) {
        // Unselect all for same target in case of mutually exclusive types
        $('svg[data-field="' + field + '"] polygon[data-target="' + target + '"]').each(function() {
            this.classList.remove('selected');
        });
    }
    if ((id ?? '').length > 0) {
        setTimeout(function() {
            $('#' + id)[0].classList[checkTargetValue(targetType, target, code) ? 'add' : 'remove']('selected');
        }, 0);
    }
}


//#region Basic Form Interaction

/**
 * Adds interactive features, i.e. binding to checkboxes, radio buttons, dropdowns
 */
function addInteractivity(field) {
    try {
        const map = config.maps[field];
        for (const areaIdx in map.areas) {
            const area = map.areas[areaIdx];
            const id = area.id;
            const type = config.targets[area.target];
            if (!checkTargetDisabled(type, area.target, area.code)) {
                setupInteractivity(field, id, type, area.target, area.code, area.mode);
            }
        }
    }
    catch(ex) {
        error('Failed to add interactive features for map field \'' + field + '\'.', ex);
    }
}

/**
 * Sets up interactive features for a single area of a map
 * @param {string} field 
 * @param {string} id 
 * @param {string} type 
 * @param {string} target 
 * @param {string} code 
 * @param {'2-way'|'to-target'|'from-target'} mode
 */
function setupInteractivity(field, id, type, target, code, mode) {
    const $shape = $('#' + id);
    if ($shape.length == 0) {
        warn('No shape found for area', field, target, code);
        return;
    }
    const shape = $shape[0];
    if (mode != 'from-target') {
        shape.addEventListener('pointerdown', function(e) { setTargetValue(field, id, type, target, code); });
    }
    if (mode == '2-way') {
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
 * @param {string} targetType 
 * @param {string} target 
 * @param {string} code 
 */
function setupTwoWayBinding(field, id, targetType, target, code) {
    switch (targetType) {
        case 'checkbox': {
            const $el = $('input[name="__chk__' + target + '_RC_' + code + '"]')
            $el.on('change', function() {
                updateAreaClass(field, id, targetType, target, code);
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
                    updateAreaClass(field, id, targetType, target, code);
                });
            }
            else {
                if (typeof twoWayRadioResetData[target] == 'undefined') twoWayRadioResetData[target] = {};
                if (typeof twoWayRadioResetData[target][field] == 'undefined') twoWayRadioResetData[target][field] = {};
                twoWayRadioResetData[target][field][id] = {
                    type: targetType,
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
                    updateAreaClass(field, this_id, targetType, this_target, this_code);
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