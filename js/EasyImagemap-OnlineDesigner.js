
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
var $svg = null;
var svg = null;
var $selectTemplate = $();
var showingEditor = false;
var JSMO = {};
var editorData = null;
var currentArea = null;
var currentAnchor = null;
var poly = null;
var assignableLabels = {};


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
    for (let fieldName of Object.keys(config.fields)) {
        log('Adding button for field ' + fieldName);

        const $btn = $('<div class="eim-configure-button" style="position:absolute; right:0.5em; bottom:0.5em;"><button class="btn btn-defaultrc btn-xs">Configure Imagemap</button></div>');
        $btn.on('click', function(e) {
            e.preventDefault();
            $btn.prop('disabled', true);
            if (!showingEditor) {
                showingEditor = true;
                JSMO.ajax('edit-map', fieldName).then(function(data) {
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
    $editor.find('.field-name').text(editorData.fieldName);
    const $body = $editor.find('.modal-body.draw');
    const paddingLeft = $body.css('padding-left');
    const paddingTop = $body.css('padding-top');
    const $img = $('#design-' + editorData.fieldName + ' td.labelrc img[src*="' + editorData.hash + '"]')
    const w = $img.width();
    const h = $img.height();
    // Build the assignable box
    $selectTemplate = $('<select><option value="" data-content="(not assigned)"></option></select>');
    for (let assignable of editorData.assignables) {
        for (let option of assignable.options) {
            const label = `<span class="badge badge-dark">${assignable.icon} ${assignable.name}</span> &ndash; ${option.label}`;
            assignableLabels[option.code] = label;
            $selectTemplate.append(`<option value='${option.code}' data-content='${label}'>[${assignable.name}] ${option.label}</option>`);
        }
    }
    // Build SVG to overlay on image
    $svg = $(`<svg tabindex="0" class="eim-svg inactive" style="position:absolute;top:${paddingTop};left:${paddingLeft};" height="${h}px" width="${w}px" viewBox="0 0 ${w} ${h}"></svg>`);
    // Add image and SVG
    $body.append($img.clone()).append($svg);
    editorData.bounds = {
        width: w,
        height: h
    };
    svg = $svg[0];
    svg.addEventListener('keydown', handleKeyEvent);
    svg.addEventListener('pointerup', handleSVGEvent);
    svg.addEventListener('pointerdown', handleSVGEvent);
    svg.addEventListener('pointermove', handleSVGEvent);
    poly = createSVG('polygon', { points: '' });
    svg.appendChild(poly);
    setMode('');
    editorData.anchors = new Array();
    editorData.areas = areasFromMap(editorData.map);

    // Add the rows
    for (let id of Object.keys(editorData.areas)) {
        addTableRow(id);
        addBackgroundPoly(id);
    }
    // UI updates
    showWhenNoAreas();
    // Some logging
    log('Invoking editor for ' + editorData.fieldName, editorData);
    // Finally, show the dialog
    // @ts-ignore
    $editor.modal({ backdrop: 'static' });
}


function areasFromMap(map) {
    const areas = {};
    for (let i of Object.keys(map)) {
        const area = map[i];
        const id = generateUUID();
        areas[id] = area;
    }
    return areas;
}

function areasToMap() {
    const ids = Object.keys(editorData.areas);
    const map = {};
    let i = 1;
    for (let id of ids) {
        const area = editorData.areas[id];
        log(area);
        map[i] = {
            points: area.points ?? '',
            target: area.target ?? '',
            label: getOptionLabel(id, area.target),
        };
        i++;
    }
    return map;
}

function getOptionLabel(id, code) {
    // TODO
    return '';
}

function createSVG(tag, attrs) {
    const el= document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (let key in attrs)
        el.setAttribute(key, attrs[key]);
    return el;
}

function getMousePosition(e) {
    const CTM = svg.getScreenCTM();
    return {
        x: Math.round((e.clientX - CTM.e) / CTM.a),
        y: Math.round((e.clientY - CTM.f) / CTM.d)
    };
}

function updatePolygon() {
    const points = editorData.anchors.map(function(anchor) {
        return `${anchor.getAttribute('cx')},${anchor.getAttribute('cy')}`;
    }).join(' ');
    poly.setAttributeNS(null, 'points', points);
}

function storePolygon(id) {
    if (id && editorData.areas.hasOwnProperty(id)) {
        const points = editorData.anchors.map(function(anchor) {
            return `${anchor.getAttribute('cx')},${anchor.getAttribute('cy')}`;
        }).join(' ');
        editorData.areas[id].points = points;
        $svg.find('polygon[data-id="' + id + '"]').each(function() {
            this.setAttributeNS(null, 'points', points);
        });
    }
}

function activateAnchor(anchor) {
    $svg.find('.anchor.active').each(function() { this.classList.remove('active'); });
    const n = editorData.anchors.length;
    if (anchor) {
        anchor.classList.add('active');
        // Shuffle array so that active is the last
        const idx = editorData.anchors.indexOf(anchor);
        if (idx != n - 1) {
            editorData.anchors.push(...editorData.anchors.splice(0, idx + 1));
        }
        currentAnchor = anchor;
    }
    else if (n > 0) {
        activateAnchor(editorData.anchors[n - 1]);
    }
    else {
        currentAnchor = null;
    }
}

function removeAnchor(anchor) {
    const idx = editorData.anchors.indexOf(anchor);
    editorData.anchors.splice(idx, 1);
    anchor.remove();
    activateAnchor(null);
}

function setMode(mode) {
    editorData.mode = mode;
    log('Mode updated to: ' + mode);
}

function handleKeyEvent(e) {
    if (editorData.mode != '') return; // Do not act when in any mode
    if (e.altKey || e.ctrlKey || e.shiftKey) return; // Ignore any combinations with modifiers
    const n = editorData.anchors.length;
    if (n == 0) return; // Nothing to do
    if (e.key == 'Backspace' && currentAnchor) {
        removeAnchor(currentAnchor);
        updatePolygon();
    }
    else if (e.key == 'Delete') {
        log(e);
        e.preventDefault();
        clearAnchors();
    }
    return false;
}

function clearAnchors() {
    editorData.anchors = [];
    $svg.find('.anchor').each(function() { this.remove() });
    activateAnchor(null);
    updatePolygon();
}


function showTooltip(evt, id) {
    if (editorData.mode == '' && evt.target.classList.contains('background')) {
        const text = assignableLabels[editorData.areas[id].target] ?? '';
        if (text && text != '') {
            const $tooltip = $('#easy-imagemap-editor-tooltip');
            const left = evt.pageX + 15 + 'px';
            const top = evt.pageY + 12 + 'px';
            $tooltip.html(text).show().css('left', left).css('top', top);
        }
    }
}

function hideTooltip() {
    const $tooltip = $('#easy-imagemap-editor-tooltip');
    $tooltip.hide().html('');
}

function handleSVGEvent(e) {
    const pos = getMousePosition(e);
    const type = e.type ?? ''
    const target = e.target
    if (editorData.mode == '' && type == 'pointerdown' && target.classList.contains('background')) {
        const id = target.getAttribute('data-id');
        setCurrentArea(id);
    }
    else if (currentArea) {
        if (editorData.mode == 'dragging' && type == 'pointermove') {
            // Update coordinates of anchor
            currentAnchor.setAttributeNS(null, 'cx', pos.x);
            currentAnchor.setAttributeNS(null, 'cy', pos.y);
            updatePolygon();
        }
        else if (editorData.mode == 'dragging' && type == 'pointerup') {
            if (pos.x < 0 || pos.y < 0 || pos.x >= editorData.bounds.width || pos.y >= editorData.bounds.height) {
                // Outside - delete anchor
                removeAnchor(currentAnchor);
            }
            else {
                // Inside - make this anchor the 'active' one
                activateAnchor(currentAnchor);
            }
            setMode('');
            svg.releasePointerCapture(e.pointerId);
            updatePolygon();
        }
        else if (editorData.mode == '' && type == 'pointerdown') {
            // Check if over anchor
            if (target.classList.contains('anchor')) {
                // Set this anchor as the active one
                currentAnchor = target;
                activateAnchor(currentAnchor);
                setMode('dragging');
            }
            else {
                // Create a new anchor
                const newAnchor = createSVG('circle', {
                    cx: pos.x,
                    cy: pos.y,
                    r: 4,
                    'class': 'anchor active',
                });
                svg.appendChild(newAnchor);
                setMode('dragging');
                currentAnchor = newAnchor;
                editorData.anchors.push(currentAnchor);
                activateAnchor(currentAnchor);
                updatePolygon();
            }
            svg.setPointerCapture(e.pointerId);
        }
    }
    else if (editorData.mode == 'preview' && type == 'pointerdown' && target.classList.contains('background')) {
        if (target.classList.contains('selected')) {
            target.classList.remove('selected');
        }
        else {
            target.classList.add('selected');
        }
    }
}

function showWhenNoAreas() {
    const numAreas = editorData && editorData.areas ? Object.keys(editorData.areas) : 0;
    $editor.find('.show-when-no-areas')[numAreas == 0 ? 'show' : 'hide']();
}


function addBackgroundPoly(id) {
    const area = editorData.areas[id];
    // Add a polygon for this area
    const $bgPoly = $svg.find('polygon[data-id="' + id + '"]')
    if ($bgPoly.length == 1) {
        $bgPoly[0].setAttributeNS(null, 'points', area.points ?? '');
    }
    else {
        const bgPoly = createSVG('polygon', { 
            points: area.points ?? '',
            'class': 'background',
            'data-id': id,
        });
        bgPoly.addEventListener('pointerout', hideTooltip);
        bgPoly.addEventListener('pointermove', function(e) { showTooltip(e, id); });
        svg.prepend(bgPoly);
    }
}

function setCurrentArea(id) {
    if (currentArea == id) return;
    if (currentArea) {
        storePolygon(currentArea);
        $svg.find('polygon.background').each(function() {
            if (this.getAttribute('data-id') == id) {
                this.classList.add('active');
            }
            else {
                this.classList.remove('active');
            }
        })
    }
    let area = null;
    currentArea = id ?? null;
    if (currentArea != null) {
        $svg.removeClass('preview');
        setMode('');
        $('tr[data-area-id="' + currentArea + '"]').find('input[name=active-area]').prop('checked', true);
        $svg.removeClass('inactive');
        if (!editorData.areas) {
            editorData.areas = {};
        }
        if (!editorData.areas[currentArea]) {
            editorData.areas[currentArea] = {};
        }
        area = editorData.areas[currentArea];
        addBackgroundPoly(currentArea);
        clearAnchors();
        // Add new anchors
        try {
            if (typeof area.points == 'string' && area.points != '') {
                for (let coords of area.points.split(' ')) {
                    const pos = coords.split(',');
                    const x = Number.parseInt(pos[0]);
                    const y = Number.parseInt(pos[1]);
                    const anchor = createSVG('circle', {
                        cx: x,
                        cy: y,
                        r: 4,
                        'class': 'anchor',
                    });
                    svg.appendChild(anchor);
                    editorData.anchors.push(anchor);
                }
            }
            activateAnchor(null);
            updatePolygon();
        }
        catch (ex) {
            showToast('Failed to initialize area. Check console for details.', true);
            error(ex);
        }
    }
    else {
        $('tr[data-area-id]').find('input[name=active-area]').prop('checked', false);
        clearAnchors();
        $svg.addClass('inactive');
    }
    log('Activating area:', area);
    // TODO
}

function handleEditorActionEvent(e) {
    const action = $(e.target).attr('data-action') ? $(e.target).attr('data-action') : $(e.target).parents('[data-action]').attr('data-action');
    const $row = $(e.target).is('tr') ? $(e.target) : $(e.target).parents('tr[data-area-id]');
    executeEditorAction(action, $row);
}

function toggleSelectAll() {
    const numAreas = Object.keys(editorData.areas).length;
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

function addTableRow(id) {
    const $row = getTemplate('area-row');
    $row.attr('data-area-id', id);
    const $select = $row.find('select');
    $select.html($selectTemplate.html());
    $select.val(editorData.areas[id].target);
    // @ts-ignore
    $select.selectpicker() //.select2();
    $row.on('click', handleEditorActionEvent);
    $editor.find('tbody.area-list').append($row);
}

function showPreview() {
    setCurrentArea(null);
    setMode('preview');
    $svg.addClass('preview');
}

function executeEditorAction(action, $row) {
    log('Editor action: ' + action)
    switch (action) {
        case 'assign-target': {
            const id = $row.attr('data-area-id');
            const code = $row.find('select').val();
            editorData.areas[id].target = code;
            const label = $row.find('select option[value="' + code + '"]').attr('data-content');
            editorData.areas[id].label = label;
        }
        break;
        case 'clear-areas': {
            editorData.areas = {};
            $editor.find('tr.area').remove();
            $svg.find('polygon.background').each(function() {
                this.remove();
            });
            setCurrentArea(null);
            showWhenNoAreas();
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
            const uuid = generateUUID();
            editorData.areas[uuid] = {};
            addTableRow(uuid);
            setCurrentArea(uuid);
            showWhenNoAreas();
        }
        break;
        case 'remove-area': {
            const id = $row.attr('data-area-id');
            if (id && editorData.areas[id]) {
                delete editorData.areas[id];
                $row.remove();
                $svg.find('polygon[data-id="' + id + '"]').each(function() {
                    this.remove();
                });
                showWhenNoAreas();
            }
            if (id == currentArea) {
                setCurrentArea(null);
            }
        }
        break;
        case 'preview': {
            showPreview();
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
            setCurrentArea(null);
            const data = {
                fieldName: editorData.fieldName,
                formName: editorData.formName,
                bounds: editorData.bounds,
                map: areasToMap(),
            }
            JSMO.ajax('save-map', data).then(function() {
                showToast('Map data was successfully saved.');
                executeEditorAction('cancel', $());
            }).catch(function(err) {
                showToast('Failed to save data. Check console for details.', true);
                error(err);
            });
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