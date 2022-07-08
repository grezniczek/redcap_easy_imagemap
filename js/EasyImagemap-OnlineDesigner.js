
// @ts-check
;(function() {

// @ts-ignore
const EIM = window.DE_RUB_EasyImagemap ?? {
    init: initialize,
};
// @ts-ignore
window.DE_RUB_EasyImagemap = EIM;

var config = {}

function initialize(data) {
    config = data;
    if (config.mode == 'OnlineDesigner') {
        log('Online Designer', config);
        // @ts-ignore
        const EIM_reloadDesignTable = window.reloadDesignTable; 
        // @ts-ignore
        window.reloadDesignTable = function(form_name, js) {
            EIM_reloadDesignTable(form_name, js);
            setTimeout(function() {
                addOnlineDesignerButtons();
            }, 50);
        }
        addOnlineDesignerButtons();
    }
}

function addOnlineDesignerButtons() {
    for (let fieldName of config.fields) {
        log('Adding button for field ' + fieldName);
        const $btn = $('<div style="position:absolute; right:0.5em; bottom:0.5em;"><button class="btn btn-defaultrc btn-xs">Configure Imagemap</button></div>');
        $btn.on('click', function(e) {
            e.preventDefault();
            editImageMap(fieldName);
            return false;
        })
        $('#design-' + fieldName + ' td.labelrc').append($btn);
    }
}

function editImageMap(fieldName) {
    log('Invoking editor for ' + fieldName);
    const $img = $('#design-' + fieldName + ' td.labelrc img[onload="fitImg(this);"]')
    const w = $img.width();
    const h = $img.height();
    log('Dimensions:', h, w);

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