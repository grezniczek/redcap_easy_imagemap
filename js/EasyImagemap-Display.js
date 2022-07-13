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
    const $wrapper = $img.wrap('<div style="position:relative;display:inline-block;"></div>').css('display', 'block').css('max-width','100%').css('height','auto').parent();
    const $svg = $('<svg tabindex="0" data-imagemap-id="eim-' + map.hash + '" style="position:absolute;top:0;left:0" height="' + map.bounds.height + 'px" width="' + map.bounds.width + 'px" viewBox="0 0 ' + map.bounds.width + ' ' + map.bounds.height + '"></svg>');
    $wrapper.append($svg);
    const svg = $svg[0];
    // Add the areas and styles
    const styles = [];
    for (const areaIdx in map.areas) {
        const id = 'eim-'+generateUUID();
        const area = map.areas[areaIdx];
        const target_code = area.target.split('::', 2);
        const target = target_code[0] ?? '';
        const code = target_code[1] ?? '';
        const poly = createSVG('polygon', { 
            points: area.points,
            id: id,
        });
        poly.addEventListener('pointerdown', function(e) { handleSVGEvent(e, field, id, target, code); });

        styles.push(
            '#' + id + ' {stroke-widht:1;stroke:orange;fill:orange;opacity:0.01;cursor:pointer;}\n' + 
            '#' + id + ':hover {opacity:0.1;}\n' + 
            '#' + id + '.selected {opacity:0.5;}\n'
        );
        svg.append(poly);
    }
    $('body').append('<style>' + styles.join('') + '</style>')
    log('Set up field \'' + field + '\' (after ' + (retryCount - retry) + ' retries):', map, $img, $svg);
}


function handleSVGEvent(e, field, id, target, code) {
    log ('Handling event for \'' + field + '\' (' + id + '):', target, code, e);
    const poly = e.target;
    if (poly.classList.contains('selected')) {
        poly.classList.remove('selected');
    }
    else {
        poly.classList.add('selected');
    }
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