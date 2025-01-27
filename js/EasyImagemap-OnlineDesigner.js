// Easy Imagemap EM
// Dr. Günther Rezniczek, Ruhr-Universität Bochum, Marien Hospital Herne
// @ts-check
;(function() {

// @ts-ignore
const EIM = window.DE_RUB_EasyImagemap ?? {
    init: initialize
};
// @ts-ignore
window.DE_RUB_EasyImagemap = EIM;

let config = {};
let $editor = $();
let $svg = null;
let $img = null;
let svg = null;
let $selectTemplate = $();
let showingEditor = false;
let JSMO = {};
let editorData = null;
let currentArea = null;
let currentAnchor = null;
let poly = null;
let assignableLabels = {};
let zoom = 1;
let editMode = 'edit';
let shapeType = 'poly';
let dndInitialized = false;


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
        $editor = $('.modal.eim-editor');
        $editor.on('click', handleEditorActionEvent);
        $editor.on('keydown', handleKeyEvent);

        // Add buttons
        addOnlineDesignerButtons();
    }
}

//#region Online Designer

function addOnlineDesignerButtons() {
    $('.eim-configure-button').remove();
    for (let fieldName of Object.keys(config.fields)) {
        log('Adding button for field ' + fieldName);

        const $btn = $('<div class="eim-configure-button" style="position:absolute; right:0.5em; bottom:0.5em;"><button class="btn btn-defaultrc btn-xs"><i class="fa-solid fa-draw-polygon eim-icon me-1"></i> Configure Imagemap</button></div>');
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
        $('#design-' + fieldName + ' td.labelrc').append($btn).children().wrapAll('<div style="position:relative;"></div>');
    }
}

//#endregion


//#region Table Drag & Drop

function setupTableDnD() {
    if (dndInitialized) return;

    const tableBody = document.querySelector('tbody.area-list');
    if (!tableBody) return;

    let draggedRow = null;

    tableBody.addEventListener('dragstart', (e) => {
        const tagName = e && e.target ? e.target['tagName'] ?? '' : '';
        if (e.target && tagName === 'TD') {
            draggedRow = e.target['parentElement'];
            draggedRow.classList.add('dragging');
            // Set TR as drag image
            e['dataTransfer'].setDragImage(draggedRow, 0, 0);
        }
    });

    tableBody.addEventListener('dragend', (e) => {
        const tagName = e && e.target ? e.target['tagName'] ?? '' : '';
        if (tagName === 'TD') {
            draggedRow.classList.remove('dragging');
            draggedRow = null;
        }
    });

    tableBody.addEventListener('dragover', (e) => {
        e.preventDefault();
        const clientY = e['clientY'] * 1;
        const closestRow = getClosestRow(clientY);
        if (draggedRow && closestRow && closestRow !== draggedRow) {
            const closestRect = closestRow.getBoundingClientRect();
            // Insert dragged row above or below based on cursor position
            if (clientY > closestRect.top + closestRect.height / 2) {
                closestRow.after(draggedRow);
            } else {
                closestRow.before(draggedRow);
            }
        }
    });

    function getClosestRow(y) {
        if (!tableBody) return null;
        const rows = Array.from(tableBody.querySelectorAll('tr:not(.dragging)'));
        // @ts-ignore
        return rows.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = Math.abs(y - box.top - box.height / 2);
            if (offset < closest.offset) {
                return { element: child, offset: offset };
            }
            return closest;
        }, { element: null, offset: Number.POSITIVE_INFINITY })['element'];
    }

    dndInitialized = true;
}

//#endregion



function updateFields() {
    JSMO.ajax('get-fields', config.form).then(function(data) {
        log('Updated fields:', data)
        config.fields = data
        setTimeout(function() {
            addOnlineDesignerButtons();
        }, 0);
    });
}


function editImageMap() {
    currentArea = null;
    currentAnchor = null;
    $editor.find('.field-name').text(editorData.fieldName);
    const $container = $editor.find('#eim-container');
    $img = $('#design-' + editorData.fieldName + ' td.labelrc img[src*="' + editorData.hash + '"]').clone();
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
    $svg = $(`<svg tabindex="0" class="eim-svg" style="height="${h}px" width="${w}px" viewBox="0 0 ${w} ${h}"></svg>`);
    // Add image and SVG
    $container.append($img).append($svg);
    
    editorData.bounds = {
        width: w,
        height: h
    };
    svg = $svg[0];
    svg.addEventListener('pointerup', handleSVGEvent);
    svg.addEventListener('pointerdown', handleSVGEvent);
    svg.addEventListener('pointermove', handleSVGEvent);
    poly = createSVG('polygon', { points: '' });
    svg.appendChild(poly);
    setMode('edit');
    editorData.anchors = new Array();
    editorData.areas = areasFromMaps(editorData.map);

    // Add the rows
    for (let id of Object.keys(editorData.areas)) {
        addTableRow(id, '');
    }
    // UI updates
    showWhenNoAreas();
    // Drag and drop support
    setupTableDnD();
    // Set two-way checkbox
    $editor.find('input[name=two-way]').prop('checked', editorData['two-way']);
    // Some logging
    log('Invoking editor for ' + editorData.fieldName, editorData);
    // Hide REDCap's move to top button
    setTimeout(() => {
        $('.to-top-button').hide();
    }, 10);
    // Finally, show the dialog
    // @ts-ignore
    $editor.modal('show', { backdrop: 'static' });
}

function applyEditMode(setToMode) {
    const prevEditMode = editMode;
    const editModes = ['edit','move'];
    if (!editModes.includes(setToMode.replace('mode-',''))) {
        error('Invalid edit mode ' + setToMode);
    }
    editMode = setToMode.replace('mode-','');
    editModes.forEach((mode) => {
        const btn = document.querySelector('button[data-action="mode-' + mode + '"]');
        if (btn) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-outline-secondary');
            if (mode == editMode) {
                btn.classList.remove('btn-outline-secondary');
                btn.classList.add('btn-secondary');
            }
            // @ts-ignore
            btn.blur();
        }
    });
    if (prevEditMode != editMode && currentArea) {
        updateCurrentArea();
    }
}

function updateCurrentArea() {
    log('Todo: Update area', currentArea);
}


//#region Zoom

function applyZoom(setToZoom) {
    ['zoom1x','zoom2x','zoom3x','zoom4x'].forEach((zoom) => {
        const btn = document.querySelector('button[data-action="' + zoom + '"]');
        if (btn) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-outline-secondary');
            if (zoom == setToZoom) {
                btn.classList.remove('btn-outline-secondary');
                btn.classList.add('btn-secondary');
                zoomTo(Number.parseInt(zoom.substring(4,5)));
            }
            // @ts-ignore
            btn.blur();
        }
    });
}

function zoomTo(f) {
    log('Setting zoom level to: ' + f);
    zoom = f;
    const zW = editorData.bounds.width * f;
    const zH = editorData.bounds.height * f;
    $svg.css('width', zW + 'px').css('height', zH + 'px');
    $img.css('width', zW + 'px').css('height', zH + 'px')
    $img.css('max-width', zW + 'px').css('max-height', zH + 'px')
    // @ts-ignore
    document.querySelector('.eim-editor').style.setProperty('--stroke-width', 1/f);
    // Redraw anchors
    const current = currentArea;
    setCurrentArea(null);
    if (current) {
        setCurrentArea(current);
    }
}

//#endregion
/**
 * Creates area objects from the map
 * @param {Array} maps 
 * @returns 
 */
function areasFromMaps(maps) {
    const areas = {};
    for (let map of maps) {
        let type = 'poly';
        if (typeof map.poly != 'undefined') {
            type = 'poly';
        } else if (typeof map.rect != 'undefined') {
            type = 'rect';
        } else if (typeof map.ell != 'undefined') {
            type = 'ell';
        }
        const mode = ['2-way', 'to-target', 'from-target'].includes(map.mode) ? map.mode : '2-way';
        areas[generateUUID()] = {
            type: type,
            mode: mode,
            label: map.label ?? '',
            target: map.target ?? '',
            data: map[type] ?? '',
        };
    }
    return areas;
}

function areasToMaps() {
    const maps = [];
    let areaIdx = 1;
    const $rows = $editor.find('tr[data-area-id]');
    for (let i = 0; i < $rows.length; i++) {
        const id = $rows.get(i)?.dataset.areaId ?? '';
        const area = editorData.areas[id] ?? { type: 'poly' };
        log('Adding area ' + id + ' at position ' + areaIdx, area);
        const map = {
            label: area.label,
            mode: area.mode,
            target: area.target,
        };
        map[area.type] = area.data;
        maps.push(map);
        areaIdx++;
    }
    return maps;
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
    if (mode == editorData.mode) return;
    editorData.mode = mode;
    log('Mode updated to: ' + mode);
    if (mode == 'preview') {
        $svg.addClass('preview');
        $('button[data-action="preview"]').removeClass('btn-outline-primary').addClass('btn-primary');
    }
    else {
        $svg.removeClass('preview');
        $('button[data-action="preview"]').addClass('btn-outline-primary').removeClass('btn-primary');
    }
    if (mode == 'edit') {
        $('button[data-action="mode-edit"]').removeClass('btn-outline-secondary').addClass('btn-secondary');
        $('button[data-action="mode-move"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
    }
    else if (mode == 'move') {
        $('button[data-action="mode-edit"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        $('button[data-action="mode-move"]').removeClass('btn-outline-secondary').addClass('btn-secondary');
    }
    else {
        $('button[data-action="mode-move"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        $('button[data-action="mode-edit"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
    }
}



function handleKeyEvent(e) {
    if (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA') return;
    // Key handling depends on mode
    // Preview mode
    if (editorData.mode == 'preview') {
        if (e.altKey || e.ctrlKey || e.shiftKey) return; // Ignore any combinations with modifiers
        // Esc exits preview mode
        if (e.key == 'Escape') {
            setMode('edit');
            e.preventDefault();
            return false;
        }
    }
    else if (editorData.mode == 'move') {
        // TODO
    }
    else if (editorData.mode == 'edit') {
        const modifier = [
            e.altKey ? 'Alt' : '',
            e.ctrlKey ? 'Ctrl' : '',
            e.shiftKey ? 'Shift' : ''
        ].join('');
        // Esc will undo any changes
        if (modifier == '' && e.key == 'Escape') {
            // TODO
            e.preventDefault();
            return false;
        }
        else if (modifier == '' && e.key == 'Backspace' && currentAnchor) {
            removeAnchor(currentAnchor);
            updatePolygon();
            e.preventDefault();
            return false;
        }
        else if (currentAnchor && modifier == '' && e.key == 'Delete') {
            clearAnchors();
            e.preventDefault();
            return false;
        }
    }
}

function clearAnchors() {
    editorData.anchors = [];
    $svg.find('.anchor').each(function() { this.remove() });
    activateAnchor(null);
    updatePolygon();
}

//#region Tooltip

// function showTooltip(evt, id) {
//     if (['edit','move'].includes(editorData.mode) && evt.target.classList.contains('background') && !evt.target.classList.contains('editing')) {
//         const text = assignableLabels[editorData.areas[id].target] ?? '';
//         if (text && text != '') {
//             const $tooltip = $('#eim-editor-tooltip');
//             const left = evt.pageX + 15 + 'px';
//             const top = evt.pageY + 12 + 'px';
//             $tooltip.html(text).show().css('left', left).css('top', top);
//         }
//     }
// }

function showTooltip(id, x, y) {
    const text = assignableLabels[editorData.areas[id].target] ?? '';
    if (text && text != '') {
        const $tooltip = $('#eim-editor-tooltip');
        const left = x + 15 + 'px';
        const top = y + 12 + 'px';
        $tooltip.html(text).show().css('left', left).css('top', top);
    }
}

function hideTooltip() {
    const $tooltip = $('#eim-editor-tooltip');
    $tooltip.hide().html('');
}

//#endregion

/**
 * 
 * @param {PointerEvent} e 
 */
function handleSVGEvent(e) {
    if ((editorData.mode == 'edit' || editorData.mode == 'move') && e.type == 'pointermove') {
        // Get all elements under the mouse position
        const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
        // Filter elements that are part of the <svg> and have the class "background"
        const backgroundElements = elementsUnderMouse.filter(element => 
            element.tagName.toLowerCase() !== 'svg' &&  // Exclude the <svg> element itself
            $svg[0].contains(element) &&                // Ensure it belongs to the SVG
            element.classList.contains('background') && // Check for the "background" class
            !element.classList.contains('editing')      // Exclude elements with the "editing" class
        );
        if (backgroundElements.length == 1) {
            showTooltip(backgroundElements[0].getAttribute('data-id'), e.pageX, e.pageY);
        }
        else {
            hideTooltip();
        }
    }
    // Only handle left mouse button
    if (e.button != 0 && editorData.mode != 'drag-anchor') return;
    const pos = getMousePosition(e);
    if (e.target == null) return;
    const type = e.type ?? ''
    const $target = $(e.target);

    // Select an area
    if (editorData.mode == 'edit' && type == 'pointerdown' && $target.hasClass('background') && $target.attr('data-id') != currentArea) {
        const id = $target.attr('data-id');
        setCurrentArea(id);
        return;
    }

    // Toggle an area while in preview mode
    if (editorData.mode == 'preview' && type == 'pointerdown' && $target.hasClass('background')) {
        if ($target.hasClass('selected')) {
            $target.removeClass('selected');
        }
        else {
            $target.addClass('selected');
        }
        return;
    }
    
    // Exit if there is no current area
    if (!currentArea) return;

    // Start an dragging or moving process
    if (editorData.mode == 'edit' && type == 'pointerdown') {
        // Check if over existing anchor
        if ($target.hasClass('anchor')) {
            // Set this anchor as the active one
            currentAnchor = $target[0];
            $target.addClass('dragging');
            activateAnchor(currentAnchor);
            // Start dragging an anchor
            setMode('drag-anchor');
        }
        else {
            // Create a new anchor
            const newAnchor = createSVG('circle', {
                cx: pos.x,
                cy: pos.y,
                r: 4 / zoom,
                'class': 'anchor active',
            });
            svg.appendChild(newAnchor);
            setMode('drag-anchor');
            currentAnchor = newAnchor;
            editorData.anchors.push(currentAnchor);
            activateAnchor(currentAnchor);
            updatePolygon();
        }
        svg.setPointerCapture(e.pointerId);
        return;
    }

    // Drag an anchor
    if (editorData.mode == 'drag-anchor' && type == 'pointermove') {
        // Update coordinates of anchor
        currentAnchor.setAttributeNS(null, 'cx', pos.x);
        currentAnchor.setAttributeNS(null, 'cy', pos.y);
        updatePolygon();
        return;
    }

    // End dragging of an anchor
    if (editorData.mode == 'drag-anchor' && type == 'pointerup') {
        if (pos.x < 0 || pos.y < 0 || pos.x >= editorData.bounds.width || pos.y >= editorData.bounds.height) {
            // Outside - delete anchor
            removeAnchor(currentAnchor);
        }
        else {
            // Inside - make this anchor the 'active' one
            activateAnchor(currentAnchor);
        }
        $svg.find('.anchor.dragging').removeClass('dragging');
        setMode('edit');
        svg.releasePointerCapture(e.pointerId);
        updatePolygon();
        return;
    }
}

function showWhenNoAreas() {
    const numAreas = editorData && editorData.areas ? Object.keys(editorData.areas) : 0;
    $editor.find('.show-when-no-areas')[numAreas == 0 ? 'show' : 'hide']();
}


/**
 * Adds or updates a background shape for an area
 * @param {string} id 
 * @param {boolean} editing 
 */
function setBackgroundShape(id, editing = false) {
    const area = editorData.areas[id];
    

    // Add a polygon for this area
    const $bgPoly = $svg.find('polygon[data-id="' + id + '"]')
    if ($bgPoly.length == 1) {
        $bgPoly[0].setAttributeNS(null, 'points', area.data ?? '');
        $bgPoly[0].classList[editing ? 'add' : 'remove']('editing');
    }
    else {
        const bgPoly = createSVG('polygon', { 
            points: area.data ?? '',
            'class': 'background',
            'data-id': id,
        });
        bgPoly.classList[editing ? 'add' : 'remove']('editing');
        // bgPoly.addEventListener('pointerout', hideTooltip);
        // bgPoly.addEventListener('pointermove', function(e) { showTooltip(e, id); });
        svg.prepend(bgPoly);
    }
}

function setCurrentArea(id) {
    hideTooltip();
    if (currentArea == id) return;
    if (currentArea) {
        storePolygon(currentArea);
        $svg.find('polygon.background').each(function() {
            if (this.getAttribute('data-id') == id) {
                this.classList.add('editing');
            }
            else {
                this.classList.remove('editing');
            }
        });
        clearAnchors();
        $('tr[data-area-id="' + currentArea + '"]').find('input[name=active-area]').prop('checked', false);
    }
    currentArea = id;
    if (currentArea == null) return;

    const area = editorData.areas[currentArea];
    // Set edit mode and update shape
    setMode('edit');
    setShapeType(area.type);
    // Update table
    $('tr[data-area-id="' + currentArea + '"]').find('input[name=active-area]').prop('checked', true);

    if (!editorData.areas) {
        editorData.areas = {};
    }
    if (!editorData.areas[currentArea]) {
        editorData.areas[currentArea] = {};
    }
    setBackgroundShape(currentArea, true);
    clearAnchors();
    // Add new anchors
    try {
        if (typeof area.data == 'string' && area.data != '') {
            for (let coords of area.data.split(' ')) {
                const pos = coords.split(',');
                const x = Number.parseInt(pos[0]);
                const y = Number.parseInt(pos[1]);
                const anchor = createSVG('circle', {
                    cx: x,
                    cy: y,
                    r: 4 / zoom,
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
    log('Activated area:', area);
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

function setShapeType(type) {
    shapeType = type;
    log('Shape type set to: ' + shapeType);
    ['ell', 'rect', 'poly'].forEach(t => {
        $('button[data-action="type-' + t + '"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        if (t == shapeType) {
            $('button[data-action="type-' + t + '"]').removeClass('btn-outline-secondary').addClass('btn-secondary');
        }
    });
}

function addNewArea() {
    const uuid = generateUUID();
    editorData.areas[uuid] = {
        type: shapeType,
        mode: '2-way',
        label: '',
        target: '',
        data: ''
    };
    return uuid;
}

function cloneArea(origId) {
    const uuid = generateUUID();
    const orig = editorData.areas[origId];
    editorData.areas[uuid] = {
        type: orig.type,
        mode: orig.mode,
        label: '',
        target: '',
        data: orig.data
    };
    return uuid;
}

function addTableRow(id, afterId = '') {
    const $row = getTemplate('area-row');
    $row.attr('data-area-id', id);
    const $select = $row.find('select');
    $select.html($selectTemplate.html());
    $select.val(editorData.areas[id].target ?? '') ;
    // @ts-ignore
    $select.selectpicker();
    if (afterId == '') {
        $editor.find('tbody.area-list').append($row);
    }
    else {
        $editor.find('tr[data-area-id="' + afterId + '"]').after($row);
    }
    // Add background shape
    setBackgroundShape(id);
}

function showPreview() {
    setCurrentArea(null);
    if (editorData.mode == 'preview') {
        setMode('edit');
    }
    else {
        setMode('preview');
    }
}


//#region Action Dispatcher


function executeEditorAction(action, $row) {
    if (action) {
        log('Editor action: ' + action)
    }
    switch (action) {
        //#region Main Toolbar
        case 'preview': {
            applyZoom('zoom1x');
            showPreview();
        }
        break;
        case 'zoom1x':
        case 'zoom2x':
        case 'zoom3x':
        case 'zoom4x':
            applyZoom(action);
        break;
        case 'mode-edit': {
            setMode('edit');
        } 
        break;
        case 'mode-move': {
            setMode('move');
        }
        break;

        //#endregion


        case 'assign-target': {
            const id = $row.attr('data-area-id');
            const code = $row.find('select').val();
            editorData.areas[id].target = code;
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
            $('[data-action="toggle-select-all"]')[0].blur();
        }
        break;
        case 'reset-area':
            setCurrentArea(null);
            $('[data-action="reset-area"]')[0].blur();
        break;
        //
        //#region Area Actions
        //
        case 'edit-area': {
            const id = $row.attr('data-area-id');
            setCurrentArea(id);
        }
        break;
        case 'select-area': {
            const id = $row.attr('data-area-id');
            const checked = $row.find('input[data-action="select-area"]').prop('checked');
            log('Select area ' + id + ': ' + (checked ? 'Checked' : 'Unchecked'));
            // TODO
        }
        break;
        case 'add-area': {
            const id = $row.attr('data-area-id') ?? '';
            const uuid = addNewArea();
            addTableRow(uuid, id);
            showWhenNoAreas();
            setCurrentArea(uuid);
        }
        break;
        case 'duplicate-area': {
            const id = $row.attr('data-area-id') ?? '';
            const uuid = cloneArea(id);
            addTableRow(uuid, id);
            showWhenNoAreas();
            setCurrentArea(uuid);
        }
        break;
        case 'remove-area': {
            const id = $row.attr('data-area-id');
            if (id == currentArea) {
                setCurrentArea(null);
            }
            if (id && editorData.areas[id]) {
                delete editorData.areas[id];
                $row.remove();
                $svg.find('polygon[data-id="' + id + '"]').each(function() {
                    this.remove();
                });
                showWhenNoAreas();
            }
        }
        break;
        //#endregion
        //#region Exit Editor
        case 'cancel': {
            // Reset
            applyZoom('zoom1x');
            editorData = null;
            $editor.find('.empty-on-close').children().remove();
            $editor.find('.remove-on-close').remove();
            // Prevent focus error
            if (document.activeElement && typeof document.activeElement['blur'] == 'function') document.activeElement['blur']();
            // Close editor
            // @ts-ignore
            $editor.modal('hide');
            $('.to-top-button').show();
        }
        break;
        case 'apply': {
            setCurrentArea(null);
            const data = {
                fieldName: editorData.fieldName,
                formName: editorData.formName,
                bounds: editorData.bounds,
                'two-way': $editor.find('input[name=two-way]').prop('checked'),
                map: areasToMaps(),
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
        //#endregion
    }
}

//#endregion

//#region Helpers

/**
 * Gets a template by name and returns its jQuery representation
 * @param {string} name 
 * @returns {JQuery<HTMLElement>}
 */
 function getTemplate(name) {
    return $($('[data-eim-template="' + name + '"]').html())
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

/**
 * Shows a message in a toast
 * @param {string} msg 
 * @param {boolean} isError
 */
function showToast(msg, isError = false) {
    // @ts-ignore
    const toastId = window.showToast("Easy Imagemap", msg, 'success', 1000);
    if (isError) {
        error($('#' + toastId).text());
    }
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