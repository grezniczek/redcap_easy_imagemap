
// @ts-check
;(function() {

// @ts-ignore
const EIM = window.DE_RUB_EasyImagemap ?? {
    init: initialize
};
// @ts-ignore
window.DE_RUB_EasyImagemap = EIM;

var config = {};
var $editor = $();
var showingEditor = false;
var JSMO = {};
var editorData = null;
var currentArea = null;


function initialize(config_data, jsmo_obj) {
    config = config_data;
    JSMO = jsmo_obj;
    if (config.mode == 'OnlineDesigner') {
        log('Online Designer', config);
        // @ts-ignore
        const EIM_reloadDesignTable = window.reloadDesignTable; 
        // @ts-ignore
        window.reloadDesignTable = function(form_name, js) {
            log('Reloaded design table')
            EIM_reloadDesignTable(form_name, js);
            updateFields();
        }
        // @ts-ignore
        const EIM_insertRow = window.insertRow;
        // @ts-ignore
        window.insertRow = function(tblId, current_field, edit_question, is_last, moveToRowAfter, section_header, delete_row) {
            log('New row inserted: ', current_field);
            EIM_insertRow(tblId, current_field, edit_question, is_last, moveToRowAfter, section_header, delete_row);
            updateFields();
        }
        // Setup editor and events
        $editor = $('.modal.easy-imagemap-editor');
        $editor.find('[data-action]').on('click', handleEditorActionEvent);

        // Add buttons
        addOnlineDesignerButtons();
    }
}

function updateFields() {
    JSMO.ajax('get-fields', config.form).then(function(data) {
        log('Updated fields:', data)
        config.fields = data
        setTimeout(function() {
            addOnlineDesignerButtons();
        }, 0);
    });
}

function addOnlineDesignerButtons() {
    $('.eim-configure-button').remove();
    for (let fieldName of config.fields) {
        log('Adding button for field ' + fieldName);

        const $btn = $('<div class="eim-configure-button" style="position:absolute; right:0.5em; bottom:0.5em;"><button class="btn btn-defaultrc btn-xs">Configure Imagemap</button></div>');
        $btn.on('click', function(e) {
            e.preventDefault();
            $btn.prop('disabled', true);
            if (!showingEditor) {
                showingEditor = true;
                JSMO.ajax('edit-field', fieldName).then(function(data) {
                    editorData = data;
                    if (editorData.map == null) {
                        editorData.map = {};
                    }
                    editImageMap();
                }).catch(function(err) {
                    showToast(err, true);
                }).finally(function() {
                    $btn.prop('disabled', false);
                    showingEditor = false;
                });
            }
            return false;
        })
        $('#design-' + fieldName + ' td.labelrc').append($btn);
    }
}

function editImageMap() {
    log('Invoking editor for ' + editorData.fieldName, editorData);
    $editor.find('.field-name').text(editorData.fieldName);
    const $body = $editor.find('.modal-body.draw');
    const paddingLeft = $body.css('padding-left');
    const paddingTop = $body.css('padding-top');
    const $img = $('#design-' + editorData.fieldName + ' td.labelrc img[onload="fitImg(this);"]')
    const w = $img.width();
    const h = $img.height();

    const $svg = $(`<svg style="position:absolute;top:${paddingTop};left:${paddingLeft};background-color:red;opacity:50%;" height="${h}px" width="${w}px" viewBox="0 0 ${w} ${h}"></svg>`);
    $body.append($img.clone()).append($svg);
    showWhenNoAreas();
        // @ts-ignore
    $editor.modal({ backdrop: 'static' });
}

function showWhenNoAreas() {
    const numAreas = editorData && editorData.map ? Object.keys(editorData.map) : 0;
    $editor.find('.show-when-no-areas')[numAreas == 0 ? 'show' : 'hide']();
}


function setCurrentArea(id) {
    currentArea = id ?? null;
    if (currentArea != null) {
        $('tr[data-area-id="' + currentArea + '"]').find('input[name=active-area]').prop('checked', true);
    }
    // TODO
}

function handleEditorActionEvent(e) {
    const action = $(e.target).attr('data-action') ? $(e.target).attr('data-action') : $(e.target).parents('[data-action]').attr('data-action');
    const $row = $(e.target).is('tr') ? $(e.target) : $(e.target).parents('tr[data-area-id]');
    executeEditorAction(action, $row);
}

function toggleSelectAll() {
    const numAreas = Object.keys(editorData.map).length;
    if (numAreas == 0) return; // Nothing to do
    const numSelected = $('tr[data-area-id] input[type="checkbox"]:checked').length;
    if (numAreas > numSelected) {
        // Select all
        $('tr[data-area-id] input[type="checkbox"]').prop('checked', true)
    }
    else if (numSelected == numAreas) {
        // Select none
        $('tr[data-area-id] input[type="checkbox"]').prop('checked', false)
    }
}

function executeEditorAction(action, $row) {
    log('Editor action: ' + action)
    switch (action) {
        case 'clear-areas': {
            $editor.find('tr.area').remove();
            showWhenNoAreas();
            setCurrentArea(null);
        }
        break;
        case 'style-area': {
            const id = $row.attr('data-area-id');
            log('Styling area ' + id);
        }
        break;
        case 'style-areas': {
            log('Styling areas ...');
        }
        break;
        case 'toggle-select-all': {
            toggleSelectAll();
        }
        break;
        case 'edit-area': {
            const id = $row.attr('data-area-id');
            setCurrentArea(id);
        }
        break;
        case 'add-area': {
            const $row = getTemplate('area-row');
            const uuid = generateUUID();
            $row.attr('data-area-id', uuid);
            $row.on('click', handleEditorActionEvent);
            editorData.map[uuid] = {};
            $editor.find('tbody.area-list').append($row);
            setCurrentArea(uuid);
            showWhenNoAreas();
        }
        break;
        case 'remove-area': {
            const id = $row.attr('data-area-id');
            if (id && editorData.map[id]) {
                delete editorData.map[id];
                $row.remove();
                showWhenNoAreas();
            }
            if (id == currentArea) {
                setCurrentArea(null);
            }
        }
        break;
        case 'cancel': {
            // Reset
            editorData = null;
            $editor.find('.empty-on-close').children().remove();
            $editor.find('.remove-on-close').remove();
            // Close editor
            // @ts-ignore
            $editor.modal('hide');
        }
        break;
        case 'apply': {
            showToast('Save Changes - Not implemented yet!', true);
            // executeEditorAction('cancel', $());
        }
        break;
    }
}

/**
 * Gets a template by name and returns its jQuery representation
 * @param {string} name 
 * @returns {JQuery<HTMLElement>}
 */
 function getTemplate(name) {
    return $($('[data-eim-template="' + name + '"]').html())
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

/**
 * Shows a message in a toast
 * @param {string} msg 
 * @param {boolean} isError
 */
function showToast(msg, isError = false) {
    const selector = isError ? '.easy-imagemap-editor.error-toast' : '.easy-imagemap-editor.success-toast';
    var $toast = $(selector);
    $toast.find('[data-content=toast]').html(msg);
    if (isError) {
        error($toast.find('[data-content=toast]').text());
    }
    // @ts-ignore
    $toast.toast('show')
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