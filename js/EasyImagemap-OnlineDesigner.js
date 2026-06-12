// Easy Imagemap EM
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

/** @type {string} The current area */
let currentAreaId = ''

let currentAnchor = null;
let lastVertexAnchor = null;
let hoverAreaId = '';

let editShape = null;
let assignableLabels = {};
let _shapeType = 'poly';
let dndInitialized = false;
let currentStyleState = 'regular';
let styleClipboard = null;
let pendingShapeChangeType = '';
let pendingStyleDeleteName = '';

const moveStartPos = { x: 0, y: 0 };
const moveDelta = { x: 0, y: 0 };
const moveGuideCenter = { x: 0, y: 0 };
const SHAPE_TYPES = ['circle', 'ell', 'rect', 'poly'];
const SHAPE_CHANGE_CONFIRM_KEY = 'DE_RUB_EasyImagemap.skipShapeChangeConfirm';
const DEFAULT_STYLE_NAME = 'default';

const STYLE_DEFAULTS = {
    regular: { fill: '#ffa500', stroke: '#ffa500', fillOpacity: 0.05, strokeOpacity: 1, strokeWidth: 1 },
    hover: { fill: '#ffa500', stroke: '#ffa500', fillOpacity: 0.2, strokeOpacity: 1, strokeWidth: 1 },
    selected: { fill: '#ffa500', stroke: '#ffa500', fillOpacity: 0.4, strokeOpacity: 1, strokeWidth: 1 },
};

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
        $editor.on('input change', '[data-action="style-change"]', handleEditorActionEvent);
        $editor.on('change', '[data-action="style-select"]', handleEditorActionEvent);
        $editor.on('changed.bs.select change', 'select.assignables', function(e) {
            executeEditorAction('assign-target', $(e.target).parents('tr[data-area-id]'), e);
        });
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

        const $btn = $('<div class="eim-configure-button" style="position:absolute; right:0.5em; bottom:0.5em;"></div>');
        $('<button class="btn btn-defaultrc btn-xs"></button>')
            .append('<i class="fa-solid fa-draw-polygon eim-icon me-1"></i>')
            .append(document.createTextNode(' ' + tt('button_configure_imagemap', 'Configure Imagemap')))
            .appendTo($btn);
        $btn.on('click', function(e) {
            e.preventDefault();
            $btn.prop('disabled', true);
            if (!showingEditor) {
                showingEditor = true;
                JSMO.ajax('edit-map', fieldName).then(function(data) {
                    editorData = data;
                    if (editorData.map == null) {
                        editorData.map = [];
                    }
                    editImageMap();
                }).catch(function(err) {
                    showToast(err, 'error');
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
    cleanupAssignableSelectpickerContainers();
    currentAreaId = '';
    currentAnchor = null;
    $editor.find('.field-name').text(editorData.fieldName);
    const $container = $editor.find('#eim-container');
    $img = $('#design-' + editorData.fieldName + ' td.labelrc img[src*="' + editorData.hash + '"]').clone();
    const w = $img.width();
    const h = $img.height();
    // Build the assignable box
    assignableLabels = {};
    const notAssigned = tt('option_not_assigned', '(not assigned)');
    $selectTemplate = $('<select></select>');
    $('<option></option>').val('').attr('data-content', notAssigned).text(notAssigned).appendTo($selectTemplate);
    for (let assignable of editorData.assignables) {
        for (let option of assignable.options) {
            const content = assignableOptionContent(assignable, option);
            assignableLabels[option.code] = content;
            $('<option></option>')
                .val(option.code)
                .attr('data-content', content)
                .text('[' + assignable.name + '] ' + option.label)
                .appendTo($selectTemplate);
        }
    }
    // Build SVG to overlay on image
    $svg = $(`<svg tabindex="0" class="eim-svg" style="height:${h}px;width:${w}px;" viewBox="0 0 ${w} ${h}"></svg>`);
    // Add image and SVG
    $container.append($img).append($svg);
    
    editorData.bounds = {
        width: w,
        height: h
    };
    editorData.zoom = 1;
    svg = $svg[0];
    svg.addEventListener('pointerup', handleSVGEvent);
    svg.addEventListener('pointerdown', handleSVGEvent);
    svg.addEventListener('pointermove', handleSVGEvent);
    setMode('edit');
    setShapeType('poly');
    setStyleState('regular');
    editorData.anchors = new Array();
    editorData.selection = new Array();
    editorData.styles = normalizeStyles(editorData.styles ?? {});
    editorData.areas = areasFromMap(editorData.map);
    updateStyleSelector();

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

function assignableOptionContent(assignable, option, isUsed = false) {
    const $badge = $('<span></span>').addClass('badge').addClass(isUsed ? 'badge-warning eim-target-used-badge' : 'badge-dark');
    $badge.append($(assignable.icon));
    $badge.append(document.createTextNode(' ' + assignable.name));
    const $content = $('<span></span>');
    $content.append($badge);
    $content.append(document.createTextNode(' - ' + option.label));
    if (isUsed) {
        $('<span></span>')
            .addClass('badge badge-light eim-target-used-marker')
            .attr('title', tt('tooltip_target_already_assigned', 'Already assigned to another shape'))
            .append($('<i></i>').addClass('fa-solid fa-check'))
            .append(document.createTextNode(' ' + tt('target_used_marker', 'used')))
            .appendTo($content);
    }
    return $content.html();
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
    editorData.zoom = f;
    const zW = editorData.bounds.width * f;
    const zH = editorData.bounds.height * f;
    $svg.css('width', zW + 'px').css('height', zH + 'px');
    $img.css('width', zW + 'px').css('height', zH + 'px')
    $img.css('max-width', zW + 'px').css('max-height', zH + 'px')
    // @ts-ignore
    document.querySelector('.eim-editor').style.setProperty('--stroke-width', 1/f);
    // Redraw anchors
    const current = currentAreaId;
    setCurrentEditArea('');
    if (current) {
        setCurrentEditArea(current);
    }
}

//#endregion

//#region Data conversion to/from storage

/**
 * Creates area objects from the map
 * @param {Array} map 
 * @returns 
 */
function areasFromMap(map) {
    const areas = {};
    for (let item of map) {
        let type = 'poly';
        if (typeof item.poly != 'undefined') {
            type = 'poly';
        } else if (typeof item.rect != 'undefined') {
            type = 'rect';
        } else if (typeof item.circle != 'undefined') {
            type = 'circle';
        } else if (typeof item.ell != 'undefined') {
            type = 'ell';
        }
        const mode = ['2-way', 'to-target', 'from-target'].includes(item.mode) ? item.mode : '2-way';
        areas[generateUUID()] = {
            type: type,
            mode: mode,
            label: item.label ?? '',
            tooltip: item.tooltip ?? '',
            target: item.target ?? '',
            style: normalizeStyleReference(item.style ?? DEFAULT_STYLE_NAME),
            data: normalizeShapeData(type, item[type] ?? null),
        };
    }
    return areas;
}

function areasToMap() {
    const map = [];
    let areaIdx = 1;
    const $rows = $editor.find('tr[data-area-id]');
    for (let i = 0; i < $rows.length; i++) {
        const id = $rows.get(i)?.dataset.areaId ?? '';
        const area = editorData.areas[id] ?? { type: 'poly' };
        log('Adding area ' + id + ' at position ' + areaIdx, area);
        const item = {
            label: area.label,
            mode: area.mode,
            target: area.target,
            tooltip: area.tooltip ?? '',
            style: normalizeStyleReference(area.style ?? DEFAULT_STYLE_NAME),
        };
        item[area.type] = area.data;
        map.push(item);
        areaIdx++;
    }
    return map;
}

function stylesToMap() {
    return normalizeStyles(editorData.styles ?? {});
}

//#endregion

function createSVG(tag, attrs) {
    const el= document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (let key in attrs)
        el.setAttribute(key, attrs[key]);
    return el;
}

function createShapeElement(type, data, attrs = {}) {
    const tag = type == 'rect' ? 'rect' : (type == 'circle' ? 'circle' : (type == 'ell' ? 'ellipse' : 'polygon'));
    const el = createSVG(tag, attrs);
    setShapeAttributes(el, type, data);
    return el;
}

function setShapeAttributes(el, type, data) {
    data = normalizeShapeData(type, data);
    if (type == 'poly') {
        el.setAttributeNS(null, 'points', data ?? '');
    }
    else if (type == 'rect') {
        el.setAttributeNS(null, 'x', data.x);
        el.setAttributeNS(null, 'y', data.y);
        el.setAttributeNS(null, 'width', data.width);
        el.setAttributeNS(null, 'height', data.height);
        setShapeRotation(el, data);
    }
    else if (type == 'circle') {
        el.setAttributeNS(null, 'cx', data.cx);
        el.setAttributeNS(null, 'cy', data.cy);
        el.setAttributeNS(null, 'r', data.r);
        el.removeAttribute('transform');
    }
    else if (type == 'ell') {
        el.setAttributeNS(null, 'cx', data.cx);
        el.setAttributeNS(null, 'cy', data.cy);
        el.setAttributeNS(null, 'rx', data.rx);
        el.setAttributeNS(null, 'ry', data.ry);
        setShapeRotation(el, data);
    }
}

function setShapeRotation(el, data) {
    const angle = cleanNumber(data.angle);
    if (!angle) {
        el.removeAttribute('transform');
        return;
    }
    const center = getShapeCenter(data);
    el.setAttributeNS(null, 'transform', `rotate(${angle} ${center.x} ${center.y})`);
}

function normalizeShapeData(type, data) {
    if (type == 'poly') {
        return typeof data == 'string' ? data.trim() : '';
    }
    if (type == 'rect') {
        data = data && typeof data == 'object' ? data : {};
        return {
            x: cleanNumber(data.x),
            y: cleanNumber(data.y),
            width: Math.max(0, cleanNumber(data.width)),
            height: Math.max(0, cleanNumber(data.height)),
            angle: cleanNumber(data.angle),
        };
    }
    if (type == 'circle') {
        data = data && typeof data == 'object' ? data : {};
        return {
            cx: cleanNumber(data.cx),
            cy: cleanNumber(data.cy),
            r: Math.max(0, cleanNumber(data.r)),
        };
    }
    if (type == 'ell') {
        data = data && typeof data == 'object' ? data : {};
        return {
            cx: cleanNumber(data.cx),
            cy: cleanNumber(data.cy),
            rx: Math.max(0, cleanNumber(data.rx)),
            ry: Math.max(0, cleanNumber(data.ry)),
            angle: cleanNumber(data.angle),
        };
    }
    return data;
}

function translateShapeData(type, data, dx, dy) {
    data = normalizeShapeData(type, data);
    if (type == 'poly') return applyTranslation(data, dx, dy);
    if (type == 'rect') return { x: data.x + dx, y: data.y + dy, width: data.width, height: data.height, angle: data.angle };
    if (type == 'circle') return { cx: data.cx + dx, cy: data.cy + dy, r: data.r };
    if (type == 'ell') return { cx: data.cx + dx, cy: data.cy + dy, rx: data.rx, ry: data.ry, angle: data.angle };
    return data;
}

function getShapeCenter(data) {
    if (typeof data.cx != 'undefined' && typeof data.cy != 'undefined') {
        return { x: cleanNumber(data.cx), y: cleanNumber(data.cy) };
    }
    return {
        x: cleanNumber(data.x) + cleanNumber(data.width) / 2,
        y: cleanNumber(data.y) + cleanNumber(data.height) / 2,
    };
}

function morphShapeData(fromType, data, toType) {
    if (fromType == toType) return normalizeShapeData(toType, data);
    if (toType == 'poly') return shapeToPolygon(fromType, data);
    if (fromType == 'rect' && (toType == 'circle' || toType == 'ell')) {
        const rect = normalizeShapeData('rect', data);
        const center = getShapeCenter(rect);
        if (toType == 'circle') {
            return normalizeShapeData('circle', { cx: center.x, cy: center.y, r: Math.min(rect.width, rect.height) / 2 });
        }
        return normalizeShapeData('ell', { cx: center.x, cy: center.y, rx: rect.width / 2, ry: rect.height / 2, angle: rect.angle });
    }
    if (fromType == 'circle' && toType == 'ell') {
        const circle = normalizeShapeData('circle', data);
        return normalizeShapeData('ell', { cx: circle.cx, cy: circle.cy, rx: circle.r, ry: circle.r, angle: 0 });
    }
    if (fromType == 'ell' && toType == 'circle') {
        const ell = normalizeShapeData('ell', data);
        return normalizeShapeData('circle', { cx: ell.cx, cy: ell.cy, r: Math.max(ell.rx, ell.ry) });
    }
    const box = getOuterBox(fromType, data);
    if (!box) return normalizeShapeData(toType, null);
    if (toType == 'rect') return normalizeShapeData('rect', {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        angle: box.angle,
    });
    if (toType == 'circle') {
        return normalizeShapeData('circle', {
            cx: box.cx,
            cy: box.cy,
            r: Math.sqrt(Math.pow(box.width / 2, 2) + Math.pow(box.height / 2, 2)),
        });
    }
    if (toType == 'ell') return normalizeShapeData('ell', {
        cx: box.cx,
        cy: box.cy,
        rx: box.width / 2,
        ry: box.height / 2,
        angle: box.angle,
    });
    return normalizeShapeData(toType, null);
}

function shapeToPolygon(fromType, data) {
    data = normalizeShapeData(fromType, data);
    if (fromType == 'poly') return data;
    if (fromType == 'rect') {
        return pointsToPoly(orientedRectPoints(getShapeCenter(data), data.width / 2, data.height / 2, data.angle));
    }
    if (fromType == 'circle') {
        return pointsToPoly(ellipsePoints({ x: data.cx, y: data.cy }, data.r, data.r, 0, 6));
    }
    if (fromType == 'ell') {
        return pointsToPoly(ellipsePoints({ x: data.cx, y: data.cy }, data.rx, data.ry, data.angle, 6));
    }
    return '';
}

function getOuterBox(type, data) {
    data = normalizeShapeData(type, data);
    if (type == 'rect' && data.width > 0 && data.height > 0) {
        const c = getShapeCenter(data);
        return { x: data.x, y: data.y, width: data.width, height: data.height, cx: c.x, cy: c.y, angle: data.angle };
    }
    if (type == 'circle' && data.r > 0) {
        return { x: data.cx - data.r, y: data.cy - data.r, width: data.r * 2, height: data.r * 2, cx: data.cx, cy: data.cy, angle: 0 };
    }
    if (type == 'ell' && data.rx > 0 && data.ry > 0) {
        return { x: data.cx - data.rx, y: data.cy - data.ry, width: data.rx * 2, height: data.ry * 2, cx: data.cx, cy: data.cy, angle: data.angle };
    }
    if (type == 'poly' && data) {
        return pointsOuterBox(polyToPoints(data));
    }
    return null;
}

function polyToPoints(poly) {
    if (!poly) return [];
    return poly.split(/\s+/).map(pair => {
        const parts = pair.split(',');
        return { x: cleanNumber(parts[0]), y: cleanNumber(parts[1]) };
    }).filter(point => !Number.isNaN(point.x) && !Number.isNaN(point.y));
}

function pointsOuterBox(points) {
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
        x: minX,
        y: minY,
        width: width,
        height: height,
        cx: minX + width / 2,
        cy: minY + height / 2,
        angle: 0,
    };
}

function polygonCenterOfMass(points) {
    if (!points.length) return { x: 0, y: 0 };
    if (points.length < 3) return averagePoint(points);
    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const cross = current.x * next.y - next.x * current.y;
        twiceArea += cross;
        cx += (current.x + next.x) * cross;
        cy += (current.y + next.y) * cross;
    }
    if (Math.abs(twiceArea) < 0.0001) return averagePoint(points);
    return {
        x: cleanNumber(cx / (3 * twiceArea)),
        y: cleanNumber(cy / (3 * twiceArea)),
    };
}

function averagePoint(points) {
    const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return {
        x: cleanNumber(sum.x / points.length),
        y: cleanNumber(sum.y / points.length),
    };
}

function orientedRectPoints(center, halfWidth, halfHeight, angle) {
    const ux = pointUnit(angle);
    const uy = pointUnit(angle + 90);
    return [
        addVectors(center, scaleVector(ux, -halfWidth), scaleVector(uy, -halfHeight)),
        addVectors(center, scaleVector(ux, halfWidth), scaleVector(uy, -halfHeight)),
        addVectors(center, scaleVector(ux, halfWidth), scaleVector(uy, halfHeight)),
        addVectors(center, scaleVector(ux, -halfWidth), scaleVector(uy, halfHeight)),
    ];
}

function ellipsePoints(center, rx, ry, angle, count) {
    const ux = pointUnit(angle);
    const uy = pointUnit(angle + 90);
    const points = [];
    for (let i = 0; i < count; i++) {
        const theta = 2 * Math.PI * i / count;
        points.push(addVectors(
            center,
            scaleVector(ux, Math.cos(theta) * rx),
            scaleVector(uy, Math.sin(theta) * ry)
        ));
    }
    return points;
}

function pointUnit(angle) {
    const radians = angle * Math.PI / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
}

function scaleVector(vector, scale) {
    return { x: vector.x * scale, y: vector.y * scale };
}

function addVectors() {
    return Array.from(arguments).reduce((sum, vector) => ({
        x: sum.x + vector.x,
        y: sum.y + vector.y,
    }), { x: 0, y: 0 });
}

function unitVector(vector) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length < 0.0001) return { x: 0, y: -1 };
    return {
        x: vector.x / length,
        y: vector.y / length,
    };
}

function pointsToPoly(points) {
    return points.map(point => `${cleanNumber(point.x)},${cleanNumber(point.y)}`).join(' ');
}

function normalizeStyle(style) {
    const source = style && typeof style == 'object' ? style : {};
    const regularSource = source.regular && typeof source.regular == 'object' ? source.regular : {};
    const regular = {
        fill: cleanColor(regularSource.fill, STYLE_DEFAULTS.regular.fill),
        stroke: cleanColor(regularSource.stroke, STYLE_DEFAULTS.regular.stroke),
        fillOpacity: cleanOpacity(regularSource.fillOpacity, STYLE_DEFAULTS.regular.fillOpacity),
        strokeOpacity: cleanOpacity(regularSource.strokeOpacity, STYLE_DEFAULTS.regular.strokeOpacity),
        strokeWidth: cleanNumber(regularSource.strokeWidth, STYLE_DEFAULTS.regular.strokeWidth),
    };
    const normalized = { regular: regular };
    const dependentDefaults = {
        hover: {
            fill: regular.fill,
            stroke: regular.stroke,
            fillOpacity: STYLE_DEFAULTS.hover.fillOpacity,
            strokeOpacity: regular.strokeOpacity,
            strokeWidth: regular.strokeWidth,
        },
        selected: {
            fill: regular.fill,
            stroke: regular.stroke,
            fillOpacity: STYLE_DEFAULTS.selected.fillOpacity,
            strokeOpacity: regular.strokeOpacity,
            strokeWidth: regular.strokeWidth,
        },
    };
    for (const state of ['hover', 'selected']) {
        const stateSource = source[state] && typeof source[state] == 'object' ? source[state] : {};
        const defaults = dependentDefaults[state];
        normalized[state] = {
            fill: cleanColor(stateSource.fill, defaults.fill),
            stroke: cleanColor(stateSource.stroke, defaults.stroke),
            fillOpacity: cleanOpacity(stateSource.fillOpacity, defaults.fillOpacity),
            strokeOpacity: cleanOpacity(stateSource.strokeOpacity, defaults.strokeOpacity),
            strokeWidth: cleanNumber(stateSource.strokeWidth, defaults.strokeWidth),
        };
    }
    return normalized;
}

function normalizeStyles(styles) {
    const normalized = {};
    normalized[DEFAULT_STYLE_NAME] = normalizeStyle(styles && typeof styles[DEFAULT_STYLE_NAME] == 'object' ? styles[DEFAULT_STYLE_NAME] : {});
    if (!styles || typeof styles != 'object') return normalized;
    Object.keys(styles).forEach(name => {
        const cleanName = normalizeStyleName(name);
        if (!cleanName || cleanName == DEFAULT_STYLE_NAME || typeof styles[name] != 'object') return;
        normalized[cleanName] = normalizeStyle(styles[name]);
    });
    return normalized;
}

function normalizeStyleName(name) {
    const clean = (name ?? '').toString().trim().replace(/\s+/g, ' ');
    return clean.length > 0 && clean.length <= 64 ? clean : '';
}

function normalizeStyleReference(style) {
    if (typeof style == 'string') {
        const name = normalizeStyleName(style);
        return name && editorData.styles[name] ? name : DEFAULT_STYLE_NAME;
    }
    if (style && typeof style == 'object') {
        return addStyleFromInline(style);
    }
    return DEFAULT_STYLE_NAME;
}

function addStyleFromInline(style) {
    const normalized = normalizeStyle(style);
    const signature = styleSignature(normalized);
    for (const name of Object.keys(editorData.styles)) {
        if (styleSignature(editorData.styles[name]) == signature) return name;
    }
    const name = uniqueStyleName('style');
    editorData.styles[name] = normalized;
    return name;
}

function uniqueStyleName(baseName) {
    const base = normalizeStyleName(baseName) || 'style';
    if (!editorData.styles[base]) return base;
    let idx = 2;
    while (editorData.styles[`${base} ${idx}`]) idx++;
    return `${base} ${idx}`;
}

function styleSignature(style) {
    return JSON.stringify(normalizeStyle(style));
}

function getStyleNameForArea(area) {
    return normalizeStyleReference(area ? area.style : DEFAULT_STYLE_NAME);
}

function getStyleByName(name) {
    name = normalizeStyleName(name);
    if (!name || !editorData.styles[name]) name = DEFAULT_STYLE_NAME;
    return normalizeStyle(editorData.styles[name] ?? {});
}

function getAreaStyle(area) {
    return getStyleByName(getStyleNameForArea(area));
}

function cleanColor(value, fallback) {
    const color = (value ?? '').toString();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
}

function cleanOpacity(value, fallback) {
    const number = Number.parseFloat(value);
    if (Number.isNaN(number)) return fallback;
    return Math.max(0, Math.min(1, cleanNumber(number)));
}

function cleanNumber(value, fallback = 0) {
    const number = Number.parseFloat(value);
    if (Number.isNaN(number)) return fallback;
    return Math.round(number * 100) / 100;
}

function getMousePosition(e) {
    const CTM = svg.getScreenCTM();
    if (CTM && typeof CTM.inverse == 'function' && typeof svg.createSVGPoint == 'function') {
        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const transformed = point.matrixTransform(CTM.inverse());
        return {
            x: Math.round(transformed.x),
            y: Math.round(transformed.y),
        };
    }
    if (!CTM) {
        const rect = svg.getBoundingClientRect();
        const scaleX = rect.width ? editorData.bounds.width / rect.width : 1;
        const scaleY = rect.height ? editorData.bounds.height / rect.height : 1;
        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY),
        };
    }
    return {
        x: Math.round((e.clientX - CTM.e) / CTM.a),
        y: Math.round((e.clientY - CTM.f) / CTM.d)
    };
}

function createEditShape(area) {
    if (editShape) {
        $svg.find('.edit-shape').remove();
    }
    editShape = createShapeElement(area.type, area.data, { 'class': 'edit-shape' });
    if (editShape) svg.appendChild(editShape);
}

function updateEditShape() {
    if (!editShape || !currentAreaId) return;
    storeShapeData(currentAreaId);
    setShapeAttributes(editShape, editorData.areas[currentAreaId].type, editorData.areas[currentAreaId].data);
    updateBackgroundShape(currentAreaId, true);
}

function storeShapeData(id) {
    const area = editorData.areas[id] ?? null;
    if (!area) return;
    const data = dataFromAnchors(area.type);
    if (data) {
        editorData.areas[id].data = data;
        $svg.find('[data-id="' + id + '"]').each(function() {
            setShapeAttributes(this, area.type, data);
        });
    }
}

function dataFromAnchors(type) {
    if (type == 'poly') {
        const points = editorData.anchors
            .filter(anchor => anchor.dataset.role != 'center')
            .map(anchor => `${anchor.getAttribute('cx')},${anchor.getAttribute('cy')}`);
        return points.length >= 3 ? points.join(' ') : points.join(' ');
    }
    if (type == 'rect' && editorData.anchors.length >= 2) {
        const centerAnchor = findAnchorByRole('center');
        const widthAnchor = findAnchorByRole('width');
        const heightAnchor = findAnchorByRole('height');
        if (!centerAnchor || !widthAnchor || !heightAnchor) return null;
        const c = anchorPoint(centerAnchor);
        const w = anchorPoint(widthAnchor);
        const h = anchorPoint(heightAnchor);
        const width = 2 * distance(c, w);
        const height = 2 * distance(c, h);
        return normalizeShapeData('rect', {
            x: c.x - width / 2,
            y: c.y - height / 2,
            width: width,
            height: height,
            angle: angleBetween(c, w),
        });
    }
    if (type == 'circle' && editorData.anchors.length >= 2) {
        const centerAnchor = findAnchorByRole('center');
        const radiusAnchor = findAnchorByRole('radius');
        if (!centerAnchor || !radiusAnchor) return null;
        const c = anchorPoint(centerAnchor);
        const r = distance(c, anchorPoint(radiusAnchor));
        return normalizeShapeData('circle', {
            cx: c.x,
            cy: c.y,
            r: r,
        });
    }
    if (type == 'ell' && editorData.anchors.length >= 3) {
        const centerAnchor = findAnchorByRole('center');
        const rxAnchor = findAnchorByRole('radius-x');
        const ryAnchor = findAnchorByRole('radius-y');
        if (!centerAnchor || !rxAnchor || !ryAnchor) return null;
        const c = anchorPoint(centerAnchor);
        const x = anchorPoint(rxAnchor);
        const y = anchorPoint(ryAnchor);
        return normalizeShapeData('ell', {
            cx: c.x,
            cy: c.y,
            rx: distance(c, x),
            ry: distance(c, y),
            angle: angleBetween(c, x),
        });
    }
    return null;
}

function anchorPoint(anchor) {
    if (anchor.tagName.toLowerCase() == 'rect') {
        return {
            x: Number.parseFloat(anchor.getAttribute('x') ?? '0') + Number.parseFloat(anchor.getAttribute('width') ?? '0') / 2,
            y: Number.parseFloat(anchor.getAttribute('y') ?? '0') + Number.parseFloat(anchor.getAttribute('height') ?? '0') / 2,
        };
    }
    return {
        x: Number.parseFloat(anchor.getAttribute('cx') ?? '0'),
        y: Number.parseFloat(anchor.getAttribute('cy') ?? '0'),
    };
}

function findAnchorByRole(role) {
    return editorData.anchors.find(anchor => anchor.dataset.role == role) ?? null;
}

function setAnchorPoint(anchor, point) {
    if (anchor.tagName.toLowerCase() == 'rect') {
        const side = Number.parseFloat(anchor.getAttribute('width') ?? '0');
        anchor.setAttributeNS(null, 'x', cleanNumber(point.x - side / 2));
        anchor.setAttributeNS(null, 'y', cleanNumber(point.y - side / 2));
        return;
    }
    anchor.setAttributeNS(null, 'cx', cleanNumber(point.x));
    anchor.setAttributeNS(null, 'cy', cleanNumber(point.y));
}

function translateAnchor(anchor, dx, dy) {
    const point = anchorPoint(anchor);
    setAnchorPoint(anchor, {
        x: point.x + dx,
        y: point.y + dy,
    });
}

function distance(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

function angleBetween(a, b) {
    return cleanNumber(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
}

function pointFromAngle(center, angle, length) {
    const radians = angle * Math.PI / 180;
    return {
        x: center.x + Math.cos(radians) * length,
        y: center.y + Math.sin(radians) * length,
    };
}

function syncOrientedHandles(constrain) {
    if (!currentAreaId || !currentAnchor) return;
    const area = editorData.areas[currentAreaId];
    if (!area || area.type == 'poly') return;

    const centerAnchor = findAnchorByRole('center');
    if (!centerAnchor) return;
    const center = anchorPoint(centerAnchor);
    const role = currentAnchor.dataset.role;

    if (area.type == 'circle') {
        return;
    }

    const primaryRole = area.type == 'rect' ? 'width' : 'radius-x';
    const secondaryRole = area.type == 'rect' ? 'height' : 'radius-y';
    const primaryAnchor = findAnchorByRole(primaryRole);
    const secondaryAnchor = findAnchorByRole(secondaryRole);
    if (!primaryAnchor || !secondaryAnchor) return;

    if (role == 'corner' && (area.type == 'rect' || area.type == 'ell')) {
        const primaryPoint = anchorPoint(primaryAnchor);
        const secondaryPoint = anchorPoint(secondaryAnchor);
        const cornerPoint = anchorPoint(currentAnchor);
        const basePrimary = Math.max(1, distance(center, primaryPoint));
        const baseSecondary = Math.max(1, distance(center, secondaryPoint));
        const v = { x: cornerPoint.x - center.x, y: cornerPoint.y - center.y };
        const diagonalAngle = Math.atan2(baseSecondary, basePrimary) * 180 / Math.PI;
        const primaryAngle = angleBetween(center, cornerPoint) - diagonalAngle;
        const scale = Math.max(0.05, distance(center, cornerPoint) / Math.sqrt(basePrimary * basePrimary + baseSecondary * baseSecondary));
        const newPrimary = basePrimary * scale;
        const newSecondary = baseSecondary * scale;
        setAnchorPoint(primaryAnchor, pointFromAngle(center, primaryAngle, newPrimary));
        setAnchorPoint(secondaryAnchor, pointFromAngle(center, primaryAngle + 90, newSecondary));
        setAnchorPoint(currentAnchor, addVectors(
            center,
            { x: anchorPoint(primaryAnchor).x - center.x, y: anchorPoint(primaryAnchor).y - center.y },
            { x: anchorPoint(secondaryAnchor).x - center.x, y: anchorPoint(secondaryAnchor).y - center.y }
        ));
    }
    else if (role == primaryRole) {
        const primary = anchorPoint(primaryAnchor);
        const angle = angleBetween(center, primary);
        const primaryLength = distance(center, primary);
        const secondaryLength = constrain ? primaryLength : distance(center, anchorPoint(secondaryAnchor));
        setAnchorPoint(secondaryAnchor, pointFromAngle(center, angle + 90, secondaryLength));
    }
    else if (role == secondaryRole) {
        const secondary = anchorPoint(secondaryAnchor);
        const angle = angleBetween(center, secondary) - 90;
        const secondaryLength = distance(center, secondary);
        const primaryLength = constrain ? secondaryLength : distance(center, anchorPoint(primaryAnchor));
        setAnchorPoint(primaryAnchor, pointFromAngle(center, angle, primaryLength));
    }
    syncCornerHandle();
}

function syncCornerHandle() {
    if (!currentAreaId || !['rect', 'ell'].includes(editorData.areas[currentAreaId]?.type)) return;
    const area = editorData.areas[currentAreaId];
    const centerAnchor = findAnchorByRole('center');
    const widthAnchor = findAnchorByRole(area.type == 'rect' ? 'width' : 'radius-x');
    const heightAnchor = findAnchorByRole(area.type == 'rect' ? 'height' : 'radius-y');
    const cornerAnchor = findAnchorByRole('corner');
    if (!centerAnchor || !widthAnchor || !heightAnchor || !cornerAnchor || currentAnchor === cornerAnchor) return;
    const c = anchorPoint(centerAnchor);
    setAnchorPoint(cornerAnchor, addVectors(c, { x: anchorPoint(widthAnchor).x - c.x, y: anchorPoint(widthAnchor).y - c.y }, { x: anchorPoint(heightAnchor).x - c.x, y: anchorPoint(heightAnchor).y - c.y }));
}

function activateAnchor(anchor, useFallback = true) {
    $svg.find('.anchor.active').each(function() { this.classList.remove('active'); });
    if (anchor) {
        anchor.classList.add('active');
        if (anchor.dataset.role != 'center') {
            lastVertexAnchor = anchor;
        }
        currentAnchor = anchor;
    }
    else if (useFallback && editorData.anchors.length > 0) {
        const center = findAnchorByRole('center');
        activateAnchor(center ?? editorData.anchors[editorData.anchors.length - 1]);
        return;
    }
    else {
        currentAnchor = null;
    }
    updateLastAnchorMarker();
}

function removeAnchor(anchor) {
    const idx = editorData.anchors.indexOf(anchor);
    editorData.anchors.splice(idx, 1);
    if (lastVertexAnchor === anchor) {
        lastVertexAnchor = null;
    }
    anchor.remove();
    activateAnchor(null);
}

function updatePolyCenterAnchor() {
    if (!currentAreaId || editorData.areas[currentAreaId]?.type != 'poly') return;
    const centerAnchor = findAnchorByRole('center');
    if (!centerAnchor || currentAnchor === centerAnchor) return;
    const points = editorData.anchors
        .filter(anchor => anchor.dataset.role != 'center')
        .map(anchorPoint);
    if (!points.length) return;
    setAnchorPoint(centerAnchor, polygonCenterOfMass(points));
}

function createAnchor(point, extraClass = '') {
    const side = 8 / editorData.zoom;
    const classes = ['anchor', extraClass].filter(Boolean).join(' ');
    if ((point.role ?? '') == 'center') {
        return createSVG('rect', {
            x: cleanNumber(point.x - side / 2),
            y: cleanNumber(point.y - side / 2),
            width: side,
            height: side,
            'class': classes,
            'data-role': point.role ?? '',
        });
    }
    return createSVG('circle', {
        cx: point.x,
        cy: point.y,
        r: side / 2,
        'class': classes,
        'data-role': point.role ?? '',
    });
}

function updateLastAnchorMarker() {
    $svg.find('.last-anchor-marker').remove();
    if (!currentAreaId || editorData.areas[currentAreaId]?.type != 'poly') return;
    if (!currentAnchor || currentAnchor.dataset.role == 'center') {
        bringCenterAnchorToFront();
        return;
    }
    const p = anchorPoint(currentAnchor);
    const next = getNextPolygonVertex(currentAnchor);
    const direction = next ? unitVector({ x: anchorPoint(next).x - p.x, y: anchorPoint(next).y - p.y }) : { x: 0, y: -1 };
    const perpendicular = { x: -direction.y, y: direction.x };
    const side = 11 / editorData.zoom;
    const height = side * 0.9;
    const tip = addVectors(p, scaleVector(direction, height * 0.75));
    const base = addVectors(p, scaleVector(direction, -height * 0.45));
    const marker = createSVG('polyline', {
        points: [
            `${cleanNumber(base.x + perpendicular.x * side / 2)},${cleanNumber(base.y + perpendicular.y * side / 2)}`,
            `${cleanNumber(tip.x)},${cleanNumber(tip.y)}`,
            `${cleanNumber(base.x - perpendicular.x * side / 2)},${cleanNumber(base.y - perpendicular.y * side / 2)}`,
        ].join(' '),
        'class': 'last-anchor-marker',
    });
    svg.appendChild(marker);
    bringCenterAnchorToFront();
}

function getNextPolygonVertex(anchor) {
    const vertices = editorData.anchors.filter(item => item.dataset.role != 'center');
    const idx = vertices.indexOf(anchor);
    if (idx == -1 || vertices.length < 2) return null;
    return vertices[(idx + 1) % vertices.length];
}

function bringCenterAnchorToFront() {
    const center = findAnchorByRole('center');
    if (center && center.parentNode) {
        center.parentNode.appendChild(center);
    }
}

function setMode(mode) {
    if (mode == editorData.mode) return;
    const prevMode = editorData.mode;
    editorData.mode = mode;
    if (mode == 'preview') {
        $svg.addClass('preview').removeClass('move').removeClass('edit');
        $('button[data-action="preview"]').removeClass('btn-outline-primary').addClass('btn-primary');
        log('Mode updated to: ' + mode);
    }
    else {
        updateHoveredArea('');
        $svg.removeClass('preview');
        $('button[data-action="preview"]').addClass('btn-outline-primary').removeClass('btn-primary');
    }
    if (mode == 'edit') {
        $('button[data-action="mode-edit"]').removeClass('btn-outline-secondary').addClass('btn-secondary');
        $('button[data-action="mode-move"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        $svg.addClass('edit').removeClass('move').removeClass('preview');
        log('Mode updated to: ' + mode);
        if (prevMode == 'move' && editorData.selection.length == 1) {
            // When there is only a single item in the selection, then set it as the currently edited area
            setCurrentEditArea(editorData.selection[0]);
        }
    }
    else if (mode == 'move') {
        if (prevMode != 'move-moving') {
            // Add current area to move selection (if there is one) and clear current area.
            const prevAreaId = currentAreaId;
            setCurrentEditArea('');
            clearEditAnchors();
            clearSelection([prevAreaId]);
        }
        $('button[data-action="mode-edit"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        $('button[data-action="mode-move"]').removeClass('btn-outline-secondary').addClass('btn-secondary');
        $svg.addClass('move').removeClass('edit').removeClass('preview');
        log('Mode updated to: ' + mode);
    }
    else if (mode != 'move') {
        $('button[data-action="mode-move"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        $('button[data-action="mode-edit"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
    }
}

//#region Selection

/**
 * Clears the current selection and optionally adds new items to the selection
 * @param {string[]} areaIds 
 */
function clearSelection(areaIds = []) {
    // Clear selection array
    editorData.selection = [];
    // Iterate over areaIds and add to selection
    for (const areaId of areaIds) {
        editorData.selection.push(areaId);
    }
    updateSelection();
}

/**
 * Adds new items to the selection
 * @param {string[]} areaIds 
 * @param {boolean} toggle When true, items will be removed if they are already in the selection
 * @returns 
 */
function addToSelection(areaIds, toggle = false) {
    for (const areaId of areaIds) {
        const idx = editorData.selection.indexOf(areaId);
        if (idx > -1 && toggle) {
            editorData.selection.splice(idx, 1);
        }
        else if (idx == -1) {
            editorData.selection.push(areaId);
        }
    }
    updateSelection();
}

/**
 * Removes items from the selection
 * @param {string[]} areaIds 
 */
function removeFromSelection(areaIds) {
    for (const areaId of areaIds) {
        const idx = editorData.selection.indexOf(areaId);
        if (idx > -1) {
            editorData.selection.splice(idx, 1);
        }
    }
    updateSelection();
}

function updateSelection() {
    // SVG
    $svg.find('.background').each(function() { 
        const id = this.getAttribute('data-id');
        if (editorData.selection.includes(id)) {
            this.classList.add('selected');
            applyDesignerShapeStyle(this, editorData.areas[id], 'selected');
        }
        else {
            this.classList.remove('selected');
            applyDesignerShapeStyle(this, editorData.areas[id], id == hoverAreaId ? 'hover' : 'regular');
        }
    });
    // Table
    $('tr[data-area-id]').each(function() {
        const checked = editorData.selection.includes(this.dataset.areaId);
        $(this).find('input[name=checked-area]').prop('checked', checked);
        updateStyleSample(this.dataset.areaId);
    });
}

function updateHoveredArea(id) {
    if (hoverAreaId == id) return;
    const previousId = hoverAreaId;
    hoverAreaId = id;
    [previousId, hoverAreaId].forEach(areaId => {
        if (!areaId || !editorData.areas[areaId]) return;
        const el = $svg.find('.background[data-id="' + areaId + '"]')[0];
        if (!el) return;
        applyDesignerShapeStyle(el, editorData.areas[areaId], editorData.selection.includes(areaId) ? 'selected' : (areaId == hoverAreaId ? 'hover' : 'regular'));
    });
}

function moveSelection(dx, dy) {
    for (const areaId of editorData.selection) {
        const area = editorData.areas[areaId];
        log('Moving area ' + areaId + ' by ' + dx + ', ' + dy, area);
        area.data = translateShapeData(area.type, area.data, dx, dy);
        $svg.find('[data-id="' + areaId + '"]').each(function() {
            setShapeAttributes(this, area.type, area.data);
        });
    }
}

function moveCurrentEditArea(dx, dy) {
    if (!currentAreaId || !editorData.areas[currentAreaId] || !editorData.anchors.length) return false;
    editorData.anchors.forEach(anchor => translateAnchor(anchor, dx, dy));
    updateEditShape();
    updateLastAnchorMarker();
    return true;
}

function moveActiveEditHandle(dx, dy) {
    if (!currentAreaId || !editorData.areas[currentAreaId] || !currentAnchor) return false;
    if (currentAnchor.dataset.role == 'center') {
        return moveCurrentEditArea(dx, dy);
    }
    translateAnchor(currentAnchor, dx, dy);
    syncOrientedHandles(false);
    updatePolyCenterAnchor();
    updateEditShape();
    updateLastAnchorMarker();
    return true;
}

function clearCurrentShapeData() {
    if (!currentAreaId || !editorData.areas[currentAreaId]) return false;
    const area = editorData.areas[currentAreaId];
    area.data = normalizeShapeData(area.type, null);
    clearEditAnchors();
    updateBackgroundShape(currentAreaId, true);
    updateStyleControls();
    return true;
}

function duplicateSelection(dx, dy) {
    const copies = [];
    const selected = selectedAreaIdsInRowOrder();
    selected.forEach(id => {
        const uuid = cloneArea(id, dx, dy);
        addTableRow(uuid, id);
        copies.push(uuid);
    });
    if (copies.length) {
        clearSelection(copies);
        if (editorData.mode == 'edit' && copies.length == 1) {
            setCurrentEditArea(copies[0]);
        }
    }
}

function duplicateCurrentEditAreaForDrag() {
    if (!currentAreaId || !editorData.areas[currentAreaId]) return false;
    const originalId = currentAreaId;
    const uuid = cloneArea(originalId, 0, 0);
    addTableRow(uuid, originalId);
    setCurrentEditArea(uuid);
    currentAnchor = findAnchorByRole('center');
    if (!currentAnchor) return false;
    currentAnchor.classList.add('dragging');
    return true;
}

function duplicateCurrentEditAreaForKeyboard() {
    if (!currentAreaId || !editorData.areas[currentAreaId] || !areaHasData(editorData.areas[currentAreaId])) return false;
    const originalId = currentAreaId;
    const uuid = cloneArea(originalId, 0, 0);
    addTableRow(uuid, originalId);
    showWhenNoAreas();
    setCurrentEditArea(uuid);
    activateCenterHandle();
    return true;
}

function startDraggingAnchor(anchor, pointerId) {
    if (!anchor) return false;
    currentAnchor = anchor;
    const anchorPos = anchorPoint(currentAnchor);
    currentAnchor.dataset.lastX = anchorPos.x;
    currentAnchor.dataset.lastY = anchorPos.y;
    currentAnchor.classList.add('dragging');
    activateAnchor(currentAnchor);
    setMode('edit-move-anchor');
    svg.setPointerCapture(pointerId);
    return true;
}

function initialDrawHandleRole(type) {
    if (type == 'circle') return 'radius';
    if (type == 'rect') return 'corner';
    if (type == 'ell') return 'corner';
    return '';
}

function insertPolygonAnchor(anchor) {
    const center = findAnchorByRole('center');
    const vertices = editorData.anchors.filter(item => item.dataset.role != 'center');
    const insertAfter = currentAnchor && currentAnchor.dataset.role != 'center'
        ? currentAnchor
        : (vertices.includes(lastVertexAnchor) ? lastVertexAnchor : vertices[vertices.length - 1]);
    if (insertAfter && editorData.anchors.includes(insertAfter)) {
        editorData.anchors.splice(editorData.anchors.indexOf(insertAfter) + 1, 0, anchor);
    }
    else if (center) {
        editorData.anchors.splice(editorData.anchors.indexOf(center), 0, anchor);
    }
    else {
        editorData.anchors.push(anchor);
    }
    lastVertexAnchor = anchor;
}

function cycleEditAnchor(reverse) {
    if (!currentAreaId || !editorData.areas[currentAreaId] || !editorData.anchors.length) return false;
    const order = getAnchorTabOrder();
    if (!order.length) return false;
    const currentIdx = order.indexOf(currentAnchor);
    const idx = currentIdx == -1 ? 0 : (currentIdx + (reverse ? -1 : 1) + order.length) % order.length;
    activateAnchor(order[idx]);
    return true;
}

function getAnchorTabOrder() {
    const area = editorData.areas[currentAreaId] ?? null;
    if (!area || area.type != 'poly') return editorData.anchors.slice();
    const center = findAnchorByRole('center');
    const vertices = editorData.anchors.filter(anchor => anchor.dataset.role != 'center');
    if (!vertices.length) return center ? [center] : [];
    const last = vertices.includes(lastVertexAnchor) ? lastVertexAnchor : vertices[vertices.length - 1];
    const lastIdx = vertices.indexOf(last);
    const orderedVertices = [];
    for (let offset = 0; offset < vertices.length; offset++) {
        orderedVertices.push(vertices[(lastIdx + offset) % vertices.length]);
    }
    return center ? [center].concat(orderedVertices) : orderedVertices;
}

function selectedAreaIdsInRowOrder() {
    return $editor.find('tr[data-area-id]').toArray()
        .map(row => row.dataset.areaId)
        .filter(id => editorData.selection.includes(id));
}

function constrainedMoveDelta(dx, dy, constrain) {
    dx = cleanNumber(dx);
    dy = cleanNumber(dy);
    if (!constrain || (dx == 0 && dy == 0)) return { x: dx, y: dy };
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
        x: cleanNumber(Math.cos(snap) * distance),
        y: cleanNumber(Math.sin(snap) * distance),
    };
}

function beginMovePreview() {
    clearMovePreview();
    const center = getSelectionCenter();
    moveGuideCenter.x = center.x;
    moveGuideCenter.y = center.y;
}

function updateMovePreview(dx, dy, isCopy, showAxes) {
    svg.style.setProperty('--move-x', isCopy ? '0px' : dx + 'px');
    svg.style.setProperty('--move-y', isCopy ? '0px' : dy + 'px');
    $svg.toggleClass('copy-moving', isCopy);
    if (isCopy) {
        updateMoveCopyPreview(dx, dy);
    }
    else {
        clearMoveCopyPreview();
    }
    updateMoveAxisGuide(showAxes);
}

function clearMovePreview() {
    svg.style.setProperty('--move-x', 0);
    svg.style.setProperty('--move-y', 0);
    $svg.removeClass('copy-moving');
    clearMoveCopyPreview();
    clearMoveAxisGuide();
}

function updateMoveCopyPreview(dx, dy) {
    clearMoveCopyPreview();
    selectedAreaIdsInRowOrder().forEach(id => {
        const area = editorData.areas[id];
        if (!area) return;
        const preview = createShapeElement(area.type, translateShapeData(area.type, area.data, dx, dy), {
            'class': 'shape moving-copy-preview',
            'data-preview-for': id,
        });
        applyDesignerShapeStyle(preview, area, 'selected');
        svg.prepend(preview);
    });
}

function clearMoveCopyPreview() {
    $svg.find('.moving-copy-preview').remove();
}

function updateMoveAxisGuide(showAxes) {
    clearMoveAxisGuide();
    if (!showAxes) return;
    const group = createSVG('g', { 'class': 'move-axis-guide' });
    [0, 45, 90, 135].forEach(angle => {
        const segment = lineSegmentThroughBounds(moveGuideCenter, angle);
        if (!segment) return;
        group.appendChild(createSVG('line', {
            x1: segment.a.x,
            y1: segment.a.y,
            x2: segment.b.x,
            y2: segment.b.y,
        }));
    });
    svg.appendChild(group);
}

function clearMoveAxisGuide() {
    $svg.find('.move-axis-guide').remove();
}

function getSelectionCenter() {
    const selected = $svg.find('.background.selected').toArray();
    if (!selected.length) return { x: moveStartPos.x, y: moveStartPos.y };
    const bounds = selected.reduce((acc, el) => {
        const box = el.getBBox();
        return {
            minX: Math.min(acc.minX, box.x),
            minY: Math.min(acc.minY, box.y),
            maxX: Math.max(acc.maxX, box.x + box.width),
            maxY: Math.max(acc.maxY, box.y + box.height),
        };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    return {
        x: cleanNumber((bounds.minX + bounds.maxX) / 2),
        y: cleanNumber((bounds.minY + bounds.maxY) / 2),
    };
}

function lineSegmentThroughBounds(center, angle) {
    const ux = Math.cos(angle * Math.PI / 180);
    const uy = Math.sin(angle * Math.PI / 180);
    const ts = [];
    if (Math.abs(ux) > 0.0001) {
        ts.push((0 - center.x) / ux);
        ts.push((editorData.bounds.width - center.x) / ux);
    }
    if (Math.abs(uy) > 0.0001) {
        ts.push((0 - center.y) / uy);
        ts.push((editorData.bounds.height - center.y) / uy);
    }
    const points = ts
        .map(t => ({ x: cleanNumber(center.x + ux * t), y: cleanNumber(center.y + uy * t), t: t }))
        .filter(point => point.x >= -0.01 && point.y >= -0.01 && point.x <= editorData.bounds.width + 0.01 && point.y <= editorData.bounds.height + 0.01)
        .sort((a, b) => a.t - b.t);
    if (points.length < 2) return null;
    return { a: points[0], b: points[points.length - 1] };
}

function applyTranslation(data, dx, dy) {
    // Apply translation to all coordinate pairs in area.data
    const pairs = data.split(' ');
    const newPairs = [];
    for (const pair of pairs) {
        const parts = pair.split(',');
        const x = parseFloat(parts[0]) + dx;
        const y = parseFloat(parts[1]) + dy;
        newPairs.push(x + ',' + y);
    }
    return newPairs.join(' ');
}

//#endregion



//#region Keyboard handling

function handleKeyEvent(e) {
    if (shouldIgnoreKeyboardEvent(e)) return;
    const modifier = [
        e.altKey ? 'Alt' : '',
        e.ctrlKey ? 'Ctrl' : '',
        e.shiftKey ? 'Shift' : ''
    ].join('');
    if (modifier == 'Ctrl' && (e.key == 'ArrowUp' || e.key == 'ArrowDown') && editorData.mode != 'preview') {
        if (selectAdjacentArea(e.key == 'ArrowDown' ? 1 : -1)) {
            e.preventDefault();
            return false;
        }
    }
    const arrowDelta = keyMoveDelta(e.key, e.shiftKey ? 10 : 1);
    if (arrowDelta && (modifier == '' || modifier == 'Shift') && editorData.mode == 'edit') {
        if (moveActiveEditHandle(arrowDelta.x, arrowDelta.y)) {
            e.preventDefault();
            return false;
        }
    }
    if (arrowDelta && (modifier == '' || modifier == 'Shift') && editorData.mode == 'move') {
        if (editorData.selection.length) {
            moveSelection(arrowDelta.x, arrowDelta.y);
            e.preventDefault();
            return false;
        }
    }
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
        // Switch to edit mode when 'e' is pressed
        if (modifier == '' && e.key == 'e') {
            setMode('edit');
        }
    }
    else if (editorData.mode == 'edit') {
        if ((modifier == '' || modifier == 'Shift') && e.key == 'Tab') {
            if (cycleEditAnchor(e.shiftKey)) {
                e.preventDefault();
                return false;
            }
        }
        // Esc will undo any changes
        else if (modifier == '' && e.key == 'Escape') {
            clearCurrentArea();
            e.preventDefault();
            return false;
        }
        else if (modifier == '' && e.key == 'Backspace' && currentAnchor && currentAnchor.dataset.role != 'center' && editorData.areas[currentAreaId]?.type == 'poly') {
            removeAnchor(currentAnchor);
            updatePolyCenterAnchor();
            updateEditShape();
            e.preventDefault();
            return false;
        }
        else if (modifier == '' && e.key == 'Delete' && currentAreaId && editorData.areas[currentAreaId]) {
            clearCurrentShapeData();
            e.preventDefault();
            return false;
        }
        else if (modifier == '' && e.key == 'c') {
            if (activateCenterHandle()) {
                e.preventDefault();
                return false;
            }
        }
        else if (modifier == '' && e.key == 'd') {
            if (duplicateCurrentEditAreaForKeyboard()) {
                e.preventDefault();
                return false;
            }
        }
        // When the letter m is pressed, switch to move mode
        else if (modifier == '' && e.key == 'm') {
            setMode('move');
        }
    }
}

function shouldIgnoreKeyboardEvent(e) {
    const $target = $(e.target);
    return $target.is('input, textarea, select, button, a')
        || $target.closest('.bootstrap-select, .dropdown-menu, [contenteditable="true"]').length > 0;
}

function keyMoveDelta(key, step = 1) {
    const deltas = {
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
    };
    return deltas[key] ?? null;
}

function activateCenterHandle() {
    if (!currentAreaId || !editorData.areas[currentAreaId] || !editorData.anchors.length) return false;
    const center = findAnchorByRole('center');
    if (!center) return false;
    activateAnchor(center);
    return true;
}

function selectAdjacentArea(direction) {
    const ids = areaIdsInRowOrder();
    if (!ids.length) return false;
    let idx = ids.indexOf(currentAreaId);
    if (idx == -1 && editorData.selection.length) {
        const selectedInRowOrder = ids.filter(id => editorData.selection.includes(id));
        idx = selectedInRowOrder.length ? ids.indexOf(selectedInRowOrder[0]) : -1;
    }
    const nextIdx = idx == -1
        ? (direction > 0 ? 0 : ids.length - 1)
        : Math.max(0, Math.min(ids.length - 1, idx + direction));
    if (idx == nextIdx && currentAreaId == ids[nextIdx]) return false;
    setMode('edit');
    setCurrentEditArea(ids[nextIdx]);
    return true;
}

function areaIdsInRowOrder() {
    return $editor.find('tr[data-area-id]').toArray()
        .map(row => row.dataset.areaId)
        .filter(id => id && editorData.areas[id]);
}

//#endregion

function clearEditAnchors() {
    editorData.anchors = [];
    $svg.find('.anchor').each(function() { this.remove() });
    $svg.find('.edit-shape').each(function() { this.remove() });
    $svg.find('.last-anchor-marker').remove();
    lastVertexAnchor = null;
    activateAnchor(null);
}

//#region Tooltip

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

//#region SVG event handling

/**
 * 
 * @param {PointerEvent} e 
 */
function handleSVGEvent(e) {
    if (e.type == 'pointerdown' && svg && typeof svg.focus == 'function') {
        try {
            svg.focus({ preventScroll: true });
        }
        catch (_) {
            svg.focus();
        }
    }
    if ((editorData.mode == 'edit' || editorData.mode == 'move' || editorData.mode == 'preview') && e.type == 'pointermove') {
        // Get all elements under the mouse position
        const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
        // Filter elements that are part of the <svg> and have the class "background"
        const backgroundElements = elementsUnderMouse.filter(element => 
            element.tagName.toLowerCase() !== 'svg' &&  // Exclude the <svg> element itself
            $svg[0].contains(element) &&                // Ensure it belongs to the SVG
            element.classList.contains('background') && // Check for the "background" class
            !element.classList.contains('editing')      // Exclude elements with the "editing" class
        );
        if (editorData.mode == 'preview') {
            updateHoveredArea(backgroundElements.length == 1 ? (backgroundElements[0].getAttribute('data-id') ?? '') : '');
        }
        if (backgroundElements.length == 1 && editorData.mode != 'preview') {
            showTooltip(backgroundElements[0].getAttribute('data-id'), e.pageX, e.pageY);
        }
        else if (editorData.mode != 'preview') {
            hideTooltip();
        }
    }
    // Only handle left mouse button
    if (e.button != 0 && !(editorData.mode == 'edit-move-anchor' || editorData.mode == 'move-moving')) return;
    const pos = getMousePosition(e);
    if (e.target == null) return;
    const type = e.type ?? ''
    const $target = $(e.target);

    //#region Mode: edit
    if (editorData.mode == 'edit') {

        // Add an area to the selection without changing the currently edited area.
        if (type == 'pointerdown' && e.ctrlKey && $target.hasClass('background')) {
            const id = $target.attr('data-id') ?? '';
            if (id != '' && editorData.areas[id]) {
                addToSelection([id]);
            }
            return;
        }

        // Select an area (that is not the currently edited area)
        if (type == 'pointerdown' && $target.hasClass('background') && $target.attr('data-id') != currentAreaId) {
            const id = $target.attr('data-id') ?? '';
            setCurrentEditArea(id);
            return;
        }

        // Start dragging an existing anchor or a new anchor
        if (type == 'pointerdown' && currentAreaId != '') {
            // Check if over existing anchor
            if ($target.hasClass('anchor')) {
                if (e.altKey && ($target[0].dataset.role ?? '') == 'center') {
                    if (!duplicateCurrentEditAreaForDrag()) return;
                }
                else {
                    currentAnchor = $target[0];
                }
                // Set this anchor as the active one
                const anchorPos = anchorPoint(currentAnchor);
                currentAnchor.dataset.lastX = anchorPos.x;
                currentAnchor.dataset.lastY = anchorPos.y;
                currentAnchor.dataset.dragMoved = '0';
                currentAnchor.classList.add('dragging');
            }
            else {
                const area = editorData.areas[currentAreaId];
                if (area.type != 'poly' && editorData.anchors.length == 0) {
                    const seededAreaId = currentAreaId;
                    seedShapeAt(currentAreaId, pos);
                    setCurrentEditArea('');
                    setCurrentEditArea(seededAreaId);
                    const dragAnchor = findAnchorByRole(initialDrawHandleRole(area.type));
                    startDraggingAnchor(dragAnchor, e.pointerId);
                    return;
                }
                if (area.type != 'poly') {
                    return;
                }
                // Create a new anchor
                const newAnchor = createAnchor({ x: pos.x, y: pos.y }, 'active dragging');
                svg.appendChild(newAnchor);
                insertPolygonAnchor(newAnchor);
                currentAnchor = newAnchor;
                currentAnchor.dataset.lastX = pos.x;
                currentAnchor.dataset.lastY = pos.y;
                currentAnchor.dataset.dragMoved = '0';
                updatePolyCenterAnchor();
                updateEditShape();
            }
            activateAnchor(currentAnchor);
            setMode('edit-move-anchor');
            svg.setPointerCapture(e.pointerId);
            return;
        }
    }

    // Move anchor
    if (editorData.mode == 'edit-move-anchor') {
        
        // Drag an anchor
        if (type == 'pointermove') {
            currentAnchor.dataset.dragMoved = '1';
            if (currentAnchor.dataset.role == 'center') {
                const anchorPos = anchorPoint(currentAnchor);
                const oldX = Number.parseFloat(currentAnchor.dataset.lastX ?? anchorPos.x);
                const oldY = Number.parseFloat(currentAnchor.dataset.lastY ?? anchorPos.y);
                const dx = pos.x - oldX;
                const dy = pos.y - oldY;
                editorData.anchors.forEach(anchor => {
                    if (anchor !== currentAnchor) {
                        translateAnchor(anchor, dx, dy);
                    }
                });
                currentAnchor.dataset.lastX = pos.x;
                currentAnchor.dataset.lastY = pos.y;
            }
            // Update coordinates of anchor
            setAnchorPoint(currentAnchor, pos);
            currentAnchor.dataset.lastX = pos.x;
            currentAnchor.dataset.lastY = pos.y;
            syncOrientedHandles(e.shiftKey);
            updatePolyCenterAnchor();
            updateEditShape();
            updateLastAnchorMarker();
            return;
        }

        // End dragging of an anchor
        if (type == 'pointerup') {
            const moved = currentAnchor.dataset.dragMoved == '1';
            const finalPos = moved ? pos : anchorPoint(currentAnchor);
            if (finalPos.x < 0 || finalPos.y < 0 || finalPos.x >= editorData.bounds.width || finalPos.y >= editorData.bounds.height) {
                if (editorData.areas[currentAreaId]?.type == 'poly' && currentAnchor.dataset.role != 'center') {
                    // Outside of edit area - delete polygon anchor
                    removeAnchor(currentAnchor);
                }
                else {
                    setAnchorPoint(currentAnchor, {
                        x: Math.max(0, Math.min(editorData.bounds.width - 1, finalPos.x)),
                        y: Math.max(0, Math.min(editorData.bounds.height - 1, finalPos.y)),
                    });
                    syncOrientedHandles(e.shiftKey);
                    activateAnchor(currentAnchor);
                }
            }
            else {
                // Inside of edit area - make this anchor the 'active' one
                activateAnchor(currentAnchor);
            }
            updateEditShape();
            updatePolyCenterAnchor();
            updateLastAnchorMarker();
            $svg.find('.anchor.dragging').removeClass('dragging');
            svg.releasePointerCapture(e.pointerId);
            setMode('edit');
            return;
        }
    }
    //#endregion

    //#region Mode: move
    if (editorData.mode == 'move' && $target.hasClass('background')) {
        // Add an area to the selection in move mode
        if (type == 'pointerdown') {
            const id = $target.attr('data-id') ?? '';
            if (id != '' && editorData.areas[id]) {
                if (e.ctrlKey) {
                    addToSelection([id]);
                    return;
                }
                if (!$target.hasClass('selected')) {
                    // Single select other item
                    clearSelection([id]); 
                }
                // Start moving
                hideTooltip();
                setMode('move-moving');
                moveStartPos.x = pos.x;
                moveStartPos.y = pos.y;
                moveDelta.x = 0;
                moveDelta.y = 0;
                beginMovePreview();
                updateMovePreview(0, 0, e.altKey, e.shiftKey);
                svg.setPointerCapture(e.pointerId);
            }
            return;
        }
    }

    if (editorData.mode == 'move-moving') {
        // Move all selected areas while in move mode
        if (type == 'pointermove') {
            // Update x and y translation
            const delta = constrainedMoveDelta(pos.x - moveStartPos.x, pos.y - moveStartPos.y, e.shiftKey);
            moveDelta.x = delta.x;
            moveDelta.y = delta.y;
            updateMovePreview(delta.x, delta.y, e.altKey, e.shiftKey);
            return;
        }

        // End moving
        if (type == 'pointerup') {
            svg.releasePointerCapture(e.pointerId);
            const delta = constrainedMoveDelta(pos.x - moveStartPos.x, pos.y - moveStartPos.y, e.shiftKey);
            const dx = delta.x || moveDelta.x;
            const dy = delta.y || moveDelta.y;
            // Reset translation
            clearMovePreview();
            if (pos.x < 0 || pos.y < 0 || pos.x >= editorData.bounds.width || pos.y >= editorData.bounds.height) {
                // Outside of edit area - do nothing
            }
            else {
                // Inside of edit area - apply dx and dy
                log('Move dx:', dx, 'dy:', dy);
                if (e.altKey && (dx != 0 || dy != 0)) {
                    duplicateSelection(dx, dy);
                }
                else if (dx != 0 || dy != 0) {
                    moveSelection(dx, dy);
                }
            }
            moveDelta.x = 0;
            moveDelta.y = 0;
            setMode('move');
            return;
        }
    }
    //#endregion

    // Mode: preview
    if (editorData.mode == 'preview') {
        // Toggle an area while in preview mode
        if (type == 'pointerdown' && $target.hasClass('background')) {
            const id = $target.attr('data-id') ?? '';
            if (!id || !editorData.areas[id]) return;
            if (editorData.selection.includes(id)) {
                removeFromSelection([id]);
            }
            else {
                addToSelection([id]);
            }
            return;
        }
    }

    
}

//#endregion

function seedShapeAt(id, pos) {
    const area = editorData.areas[id];
    if (area.type == 'rect') {
        area.data = normalizeShapeData('rect', { x: pos.x - 30, y: pos.y - 20, width: 60, height: 40, angle: 0 });
    }
    else if (area.type == 'circle') {
        area.data = normalizeShapeData('circle', { cx: pos.x, cy: pos.y, r: 1 });
    }
    else if (area.type == 'ell') {
        area.data = normalizeShapeData('ell', { cx: pos.x, cy: pos.y, rx: 35, ry: 25, angle: 0 });
    }
    updateBackgroundShape(id, true);
}

function showWhenNoAreas() {
    const numAreas = editorData && editorData.areas ? Object.keys(editorData.areas).length : 0;
    $editor.find('.show-when-no-areas')[numAreas == 0 ? 'show' : 'hide']();
}


/**
 * Adds or updates a background shape for an area
 * @param {string} id 
 * @param {boolean} editing 
 */
function updateBackgroundShape(id, editing = false) {
    const area = editorData.areas[id];
    updateAreaRowState(id);
    const $bg = $svg.find('.background[data-id="' + id + '"]');
    if ($bg.length == 1 && $bg[0].tagName.toLowerCase() == shapeTag(area.type)) {
        setShapeAttributes($bg[0], area.type, area.data);
        $bg[0].classList[editing ? 'add' : 'remove']('editing');
        applyDesignerShapeStyle($bg[0], area, editorData.selection.includes(id) ? 'selected' : (id == hoverAreaId ? 'hover' : 'regular'));
    }
    else {
        $bg.remove();
        const bg = createShapeElement(area.type, area.data, {
            'class': 'shape background',
            'data-id': id,
        });
        bg.classList[editing ? 'add' : 'remove']('editing');
        applyDesignerShapeStyle(bg, area, 'regular');
        svg.prepend(bg);
    }
    updateStyleSample(id);
}

function shapeTag(type) {
    return type == 'rect' ? 'rect' : (type == 'circle' ? 'circle' : (type == 'ell' ? 'ellipse' : 'polygon'));
}

function applyDesignerShapeStyle(el, area, state) {
    const style = getAreaStyle(area)[state] ?? STYLE_DEFAULTS[state];
    el.style.fill = style.fill;
    el.style.stroke = style.stroke;
    el.style.fillOpacity = style.fillOpacity;
    el.style.strokeOpacity = style.strokeOpacity;
    el.style.strokeWidth = style.strokeWidth;
}

function updateStyleSample(id) {
    const area = editorData.areas[id] ?? null;
    if (!area) return;
    updateAreaRowState(id);
    const style = getAreaStyle(area);
    const $sample = $('tr[data-area-id="' + id + '"]').find('.area-style-sample');
    $sample.empty();
    ['regular', 'hover', 'selected'].forEach(state => {
        const $swatch = $('<span></span>');
        applyStyleToSwatch($swatch, style[state]);
        $sample.append($swatch);
    });
}

/**
 * Clears the current area
 */
function clearCurrentArea() {
    setCurrentEditArea('');
}

/**
 * Sets the current area and updates the UI
 * @param {string} id 
 * @returns void
 */
function setCurrentEditArea(id) {
    hideTooltip();
    if (currentAreaId == id) {
        if (id) scrollAreaRowIntoView(id);
        return;
    }
    if (currentAreaId) {
        storeShapeData(currentAreaId);
        $svg.find('.background').each(function() {
            if (this.getAttribute('data-id') == id) {
                this.classList.add('editing');
            }
            else {
                this.classList.remove('editing');
            }
        });
        clearEditAnchors();
        $('tr[data-area-id="' + currentAreaId + '"]').find('input[name=active-area]').prop('checked', false);
    }
    currentAreaId = id;
    const area = editorData.areas[currentAreaId] ?? null;
    if (area == null) {
        updateStyleControls();
        return;
    }

    // Set edit mode and update shape
    setShapeType(area.type);
    setSelectedStyleName(area.style ?? DEFAULT_STYLE_NAME);
    // Update table
    $('tr[data-area-id="' + currentAreaId + '"]').find('input[name=active-area]').prop('checked', true);
    scrollAreaRowIntoView(currentAreaId);
    // Update SVG
    updateBackgroundShape(currentAreaId, true);
    clearEditAnchors();
    // Add new anchors
    try {
        createEditShape(area);
        const points = anchorsFromShape(area.type, area.data);
        for (let point of points) {
            const anchor = createAnchor(point);
            svg.appendChild(anchor);
            editorData.anchors.push(anchor);
        }
        if (area.type == 'poly') {
            const vertices = editorData.anchors.filter(anchor => anchor.dataset.role != 'center');
            lastVertexAnchor = vertices[vertices.length - 1] ?? null;
        }
        activateAnchor(null, false);
    updateEditShape();
    updateStyleControls();
    }
    catch (ex) {
        showToast(tt('toast_failed_initialize_area', 'Failed to initialize area. Check console for details.'), 'error');
        error(ex);
    }
    log('Activated area:', area);
}

function scrollAreaRowIntoView(id) {
    const container = $editor.find('.area-assignments-table')[0];
    const row = $editor.find('tr[data-area-id="' + id + '"]')[0];
    if (!container || !row) return;
    const headerHeight = $editor.find('table.eim-areas thead').outerHeight() || 0;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewTop = container.scrollTop + headerHeight;
    const viewBottom = container.scrollTop + container.clientHeight;
    if (rowTop < viewTop) {
        container.scrollTop = Math.max(0, rowTop - headerHeight);
    }
    else if (rowBottom > viewBottom) {
        container.scrollTop = rowBottom - container.clientHeight;
    }
}

function anchorsFromShape(type, data) {
    data = normalizeShapeData(type, data);
    if (type == 'poly') {
        if (!data) return [];
        const points = data.split(/\s+/).map(coords => {
            const pos = coords.split(',');
            return { x: cleanNumber(pos[0]), y: cleanNumber(pos[1]) };
        });
        if (points.length) {
            points.push(Object.assign(polygonCenterOfMass(points), { role: 'center' }));
        }
        return points;
    }
    if (type == 'rect') {
        if (!data.width || !data.height) return [];
        const c = getShapeCenter(data);
        const widthPoint = pointFromAngle(c, data.angle, data.width / 2);
        const heightPoint = pointFromAngle(c, data.angle + 90, data.height / 2);
        return [
            { x: c.x, y: c.y, role: 'center' },
            Object.assign(widthPoint, { role: 'width' }),
            Object.assign(heightPoint, { role: 'height' }),
            Object.assign(addVectors(c, { x: widthPoint.x - c.x, y: widthPoint.y - c.y }, { x: heightPoint.x - c.x, y: heightPoint.y - c.y }), { role: 'corner' }),
        ];
    }
    if (type == 'circle') {
        if (!data.r) return [];
        return [
            { x: data.cx, y: data.cy, role: 'center' },
            { x: data.cx + data.r, y: data.cy, role: 'radius' },
        ];
    }
    if (type == 'ell') {
        if (!data.rx || !data.ry) return [];
        const c = { x: data.cx, y: data.cy };
        const rxPoint = pointFromAngle(c, data.angle, data.rx);
        const ryPoint = pointFromAngle(c, data.angle + 90, data.ry);
        return [
            { x: c.x, y: c.y, role: 'center' },
            Object.assign(rxPoint, { role: 'radius-x' }),
            Object.assign(ryPoint, { role: 'radius-y' }),
            Object.assign(addVectors(c, { x: rxPoint.x - c.x, y: rxPoint.y - c.y }, { x: ryPoint.x - c.x, y: ryPoint.y - c.y }), { role: 'corner' }),
        ];
    }
    return [];
}

function handleEditorActionEvent(e) {
    const action = $(e.target).attr('data-action') ? $(e.target).attr('data-action') : $(e.target).parents('[data-action]').attr('data-action');
    const $row = $(e.target).is('tr') ? $(e.target) : $(e.target).parents('tr[data-area-id]');
    executeEditorAction(action, $row, e);
}

function toggleSelectAll() {
    const numAreas = Object.keys(editorData.areas).length;
    if (numAreas == 0) return; // Nothing to do
    const numSelected = $('tr[data-area-id] input[type="checkbox"]:checked').length;
    if (numAreas > numSelected) {
        // Select all
        clearSelection(Object.keys(editorData.areas));
    }
    else if (numSelected == numAreas) {
        // Select none
        clearSelection([]);
    }
}

function setShapeType(type) {
    if (!SHAPE_TYPES.includes(type)) return;
    if (currentAreaId && editorData.areas[currentAreaId] && editorData.areas[currentAreaId].type != type) {
        const area = editorData.areas[currentAreaId];
        if (areaHasData(area) && !skipShapeChangeConfirm()) {
            showShapeChangeDialog(type);
            return;
        }
        applyShapeTypeChange(type);
        return;
    }
    setShapeTypeButtonState(type);
}

function setShapeTypeButtonState(type) {
    _shapeType = type;
    log('Shape type set to: ' + _shapeType);
    SHAPE_TYPES.forEach(t => {
        $('button[data-action="type-' + t + '"]').addClass('btn-outline-secondary').removeClass('btn-secondary');
        if (t == _shapeType) {
            $('button[data-action="type-' + t + '"]').removeClass('btn-outline-secondary').addClass('btn-secondary');
        }
    });
}

function applyShapeTypeChange(type) {
    if (!currentAreaId || !editorData.areas[currentAreaId] || !SHAPE_TYPES.includes(type)) return;
    storeShapeData(currentAreaId);
    const area = editorData.areas[currentAreaId];
    const fromType = area.type;
    area.data = morphShapeData(fromType, area.data, type);
    area.type = type;
    setShapeTypeButtonState(type);
    $svg.find('[data-id="' + currentAreaId + '"]').remove();
    clearEditAnchors();
    updateBackgroundShape(currentAreaId, true);
    createEditShape(area);
    const points = anchorsFromShape(area.type, area.data);
    for (let point of points) {
        const anchor = createAnchor(point);
        svg.appendChild(anchor);
        editorData.anchors.push(anchor);
    }
    if (area.type == 'poly') {
        const vertices = editorData.anchors.filter(anchor => anchor.dataset.role != 'center');
        lastVertexAnchor = vertices[vertices.length - 1] ?? null;
    }
    activateAnchor(null, false);
    updateEditShape();
}

function skipShapeChangeConfirm() {
    try {
        return window.localStorage.getItem(SHAPE_CHANGE_CONFIRM_KEY) == '1';
    }
    catch (_) {
        return false;
    }
}

function showShapeChangeDialog(type) {
    pendingShapeChangeType = type;
    const from = shapeLabel(editorData.areas[currentAreaId].type);
    const to = shapeLabel(type);
    const $dialog = $editor.find('.eim-shape-change-dialog');
    $dialog.find('p').text(tt('dialog_shape_change_message', '{from} will be converted to {to}. Existing placement will be preserved as closely as possible.', { from: from, to: to }));
    $dialog.find('[data-eim-shape-change-skip]').prop('checked', false);
    $dialog.css('display', 'flex');
}

function hideShapeChangeDialog() {
    pendingShapeChangeType = '';
    $editor.find('.eim-shape-change-dialog').hide();
}

function confirmShapeChange() {
    const type = pendingShapeChangeType;
    const $dialog = $editor.find('.eim-shape-change-dialog');
    if ($dialog.find('[data-eim-shape-change-skip]').prop('checked')) {
        try {
            window.localStorage.setItem(SHAPE_CHANGE_CONFIRM_KEY, '1');
        }
        catch (_) { }
    }
    hideShapeChangeDialog();
    applyShapeTypeChange(type);
}

function updateAreaRowState(id) {
    const area = editorData.areas[id] ?? null;
    const $row = $editor.find('tr[data-area-id="' + id + '"]');
    const missingShape = !!area && !areaHasData(area);
    $row.toggleClass('eim-area-missing-shape', missingShape);
}

function shapeLabel(type) {
    return {
        circle: tt('shape_circle', 'Circle'),
        ell: tt('shape_ellipse', 'Ellipse'),
        rect: tt('shape_rectangle', 'Rectangle'),
        poly: tt('shape_polygon', 'Polygon'),
    }[type] ?? tt('shape_unknown', 'Shape');
}

function getShapeType() {
    return _shapeType;
}

function areaHasData(area) {
    if (area.type == 'poly') return typeof area.data == 'string' && area.data.trim().split(/\s+/).filter(point => /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(point)).length >= 3;
    if (area.type == 'rect') return area.data && area.data.width > 0 && area.data.height > 0;
    if (area.type == 'circle') return area.data && area.data.r > 0;
    if (area.type == 'ell') return area.data && area.data.rx > 0 && area.data.ry > 0;
    return false;
}

function addNewArea() {
    const uuid = generateUUID();
    editorData.areas[uuid] = {
        type: getShapeType(),
        mode: '2-way',
        label: '',
        tooltip: '',
        target: '',
        style: getSelectedStyleName(),
        data: normalizeShapeData(getShapeType(), null)
    };
    return uuid;
}

function cloneArea(origId, dx = 10, dy = 10) {
    const uuid = generateUUID();
    const orig = editorData.areas[origId];
    editorData.areas[uuid] = {
        type: orig.type,
        mode: orig.mode,
        label: '',
        tooltip: orig.tooltip ?? '',
        target: '',
        style: normalizeStyleReference(orig.style ?? DEFAULT_STYLE_NAME),
        data: translateShapeData(orig.type, orig.data, dx, dy)
    };
    return uuid;
}

function addTableRow(id, afterId = '') {
    const $row = getTemplate('area-row');
    $row.attr('data-area-id', id);
    const $select = $row.find('select');
    $select.html($selectTemplate.html());
    $select.val(editorData.areas[id].target ?? '') ;
    if (afterId == '') {
        $editor.find('tbody.area-list').append($row);
    }
    else {
        $editor.find('tr[data-area-id="' + afterId + '"]').after($row);
    }
    initializeAssignableSelect($select);
    // Add background shape
    updateBackgroundShape(id);
}

function initializeAssignableSelect($select) {
    // Render the menu outside the scrollable assignments table so it can overlap the style panel cleanly.
    $select.on('shown.bs.select loaded.bs.select rendered.bs.select', function() {
        tagAssignableSelectpickerContainer($select);
        decorateAssignableMenu($select);
        sanitizeAssignableButton($select);
    });
    // @ts-ignore
    $select.selectpicker({
        container: '.eim-editor'
    });
    tagAssignableSelectpickerContainer($select);
    sanitizeAssignableButton($select);
}

function decorateAssignableMenu($select) {
    const picker = $select.data('selectpicker');
    if (!picker || !picker.$menu) return;
    const currentId = $select.closest('tr[data-area-id]').attr('data-area-id') ?? '';
    const usedTargets = assignedTargets(currentId);
    const $items = picker.$menu.find('li:not(.divider):not(.dropdown-header)');
    $select.find('option').each(function(idx) {
        const code = (this.value ?? '').toString();
        const isUsed = !!code && usedTargets.has(code);
        const $item = $items.eq(idx);
        $item.toggleClass('eim-target-used-option', isUsed);
        $item.find('.eim-target-used-marker').remove();
        const $badge = $item.find('.badge').first();
        $badge
            .toggleClass('badge-warning eim-target-used-badge', isUsed)
            .toggleClass('badge-dark', !isUsed);
        if (isUsed) {
            const $text = $item.find('a .text').first();
            ($text.length ? $text : $item.find('a').first()).append(usedTargetMarkerContent());
        }
    });
}

function usedTargetMarkerContent() {
    const $marker = $('<span></span>')
        .addClass('badge badge-light eim-target-used-marker')
        .attr('title', tt('tooltip_target_already_assigned', 'Already assigned to another shape'))
        .append($('<i></i>').addClass('fa-solid fa-check'))
        .append(document.createTextNode(' ' + tt('target_used_marker', 'used')));
    return $marker;
}

function sanitizeAssignableButton($select) {
    const picker = $select.data('selectpicker');
    if (!picker || !picker.$button) return;
    const $selected = $select.find('option:selected').first();
    const content = $selected.attr('data-content') || $selected.text();
    picker.$button.find('.filter-option-inner-inner').html(content);
}

function cleanupAssignableSelectpickerContainers() {
    $('.eim-selectpicker-container').remove();
}

function assignedTargets(excludeId = '') {
    const targets = new Set();
    Object.keys(editorData.areas ?? {}).forEach(id => {
        if (id == excludeId) return;
        const area = editorData.areas[id];
        if (area && area.target && areaHasData(area)) targets.add(area.target);
    });
    return targets;
}

function tagAssignableSelectpickerContainer($select) {
    const picker = $select.data('selectpicker');
    if (picker && picker.$bsContainer) {
        picker.$bsContainer.addClass('eim-selectpicker-container');
    }
}

/**
 * Toggle the preview mode (preview -> edit or edit/move -> preview)
 */
function togglePreview() {
    clearCurrentArea();
    setMode(editorData.mode == 'preview' ? 'edit' : 'preview');
}

function setStyleState(state) {
    if (!['regular', 'hover', 'selected'].includes(state)) return;
    currentStyleState = state;
    ['regular', 'hover', 'selected'].forEach(s => {
        const $btn = $('.eim-style-state[data-action="style-' + s + '"]');
        $btn.toggleClass('active', s == state);
    });
    updateStyleControls();
}

function updateStyleSelector() {
    const $select = $editor.find('[data-action="style-select"]');
    const selected = getSelectedStyleName();
    $select.empty();
    Object.keys(editorData.styles).forEach(name => {
        $('<option></option>').attr('value', name).text(name).appendTo($select);
    });
    if (!editorData.styles[selected]) {
        $select.val(DEFAULT_STYLE_NAME);
    }
    else {
        $select.val(selected);
    }
    updateStyleDeleteButtonState();
}

function getSelectedStyleName() {
    const selected = normalizeStyleName($editor.find('[data-action="style-select"]').val());
    return selected && editorData.styles[selected] ? selected : DEFAULT_STYLE_NAME;
}

function setSelectedStyleName(name) {
    name = normalizeStyleName(name);
    if (!name || !editorData.styles[name]) name = DEFAULT_STYLE_NAME;
    $editor.find('[data-action="style-select"]').val(name);
}

function updateStyleControls() {
    if (!editorData) return;
    const area = editorData && currentAreaId ? editorData.areas[currentAreaId] : null;
    if (area) setSelectedStyleName(area.style ?? DEFAULT_STYLE_NAME);
    updateStyleSelector();
    const style = getStyleByName(getSelectedStyleName());
    const stateStyle = style[currentStyleState];
    ['regular', 'hover', 'selected'].forEach(state => {
        applyStyleToSwatch($editor.find('[data-style-state-preview="' + state + '"]'), style[state]);
    });
    for (const prop of ['fill', 'stroke', 'fillOpacity', 'strokeOpacity', 'strokeWidth']) {
        $editor.find('[data-style-prop="' + prop + '"]').val(stateStyle[prop]);
    }
    updateStyleDeleteButtonState();
    updateModeButtons();
}

function updateStyleDeleteButtonState() {
    if (!editorData) return;
    const canDelete = Object.keys(editorData.styles ?? {}).length > 1;
    const $button = $editor.find('[data-action="style-delete-start"]');
    const $wrapper = $editor.find('[data-style-delete-wrapper]');
    $button.prop('disabled', !canDelete);
    $wrapper.attr('title', canDelete ? tt('tooltip_delete_style', 'Delete selected style') : tt('tooltip_delete_style_disabled', 'The last remaining style cannot be deleted'));
}

function applyStyleToSwatch($swatch, style) {
    $swatch.css({
        backgroundColor: hexToRgba(style.fill, style.fillOpacity),
        borderColor: hexToRgba(style.stroke, style.strokeOpacity),
        borderWidth: Math.max(1, cleanNumber(style.strokeWidth)) + 'px',
        borderStyle: 'solid',
    });
}

function hexToRgba(hex, opacity) {
    const color = cleanColor(hex, '#000000').replace('#', '');
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${cleanOpacity(opacity, 1)})`;
}

function applyStyleChange(prop, value) {
    const name = getSelectedStyleName();
    const style = getStyleByName(name);
    if (prop == 'fill' || prop == 'stroke') {
        style[currentStyleState][prop] = cleanColor(value, style[currentStyleState][prop]);
    }
    else if (prop == 'fillOpacity' || prop == 'strokeOpacity') {
        style[currentStyleState][prop] = cleanOpacity(value, style[currentStyleState][prop]);
    }
    else if (prop == 'strokeWidth') {
        style[currentStyleState][prop] = Math.max(0, Math.min(20, cleanNumber(value, style[currentStyleState][prop])));
    }
    editorData.styles[name] = style;
    updateAreasUsingStyle(name);
    updateStyleControls();
}

function applyStyleToSelected() {
    const name = getSelectedStyleName();
    for (const id of editorData.selection) {
        if (!editorData.areas[id]) continue;
        editorData.areas[id].style = name;
        updateBackgroundShape(id, id == currentAreaId);
    }
    updateStyleControls();
}

function copyStyleState() {
    styleClipboard = Object.assign({}, getStyleByName(getSelectedStyleName())[currentStyleState]);
}

function pasteStyleState() {
    if (!styleClipboard) return;
    const name = getSelectedStyleName();
    const style = getStyleByName(name);
    style[currentStyleState] = Object.assign({}, styleClipboard);
    editorData.styles[name] = style;
    updateAreasUsingStyle(name);
    updateStyleControls();
}

function syncStyleStates() {
    const name = getSelectedStyleName();
    const style = getStyleByName(name);
    const source = Object.assign({}, style[currentStyleState]);
    ['regular', 'hover', 'selected'].forEach(state => {
        style[state] = Object.assign({}, source);
    });
    editorData.styles[name] = style;
    updateAreasUsingStyle(name);
    updateStyleControls();
}

function updateAreasUsingStyle(name) {
    Object.keys(editorData.areas).forEach(id => {
        if (getStyleNameForArea(editorData.areas[id]) == name) {
            updateBackgroundShape(id, id == currentAreaId);
        }
    });
}

function assignSelectedStyle(name, ids) {
    name = normalizeStyleName(name);
    if (!name || !editorData.styles[name]) return;
    ids.forEach(id => {
        if (!editorData.areas[id]) return;
        editorData.areas[id].style = name;
        updateBackgroundShape(id, id == currentAreaId);
    });
    updateStyleControls();
}

function showStylePanel() {
    $editor.find('.eim-style-panel-toggle').hide();
    $editor.find('.eim-style-panel').show();
    updateStyleControls();
}

function hideStylePanel() {
    hideNewStyleInput();
    $editor.find('.eim-style-panel').hide();
    $editor.find('.eim-style-panel-toggle').show();
}

function showNewStyleInput() {
    const base = uniqueStyleName(tt('style_name_base', 'style'));
    const $panel = $editor.find('.eim-style-new');
    $panel.css('display', 'flex');
    $panel.find('[data-style-new-name]').val(base).trigger('focus').trigger('select');
}

function hideNewStyleInput() {
    $editor.find('.eim-style-new').hide();
}

function addNamedStyle() {
    const $input = $editor.find('[data-style-new-name]');
    const name = normalizeStyleName($input.val());
    if (!name) {
        showToast(tt('toast_enter_style_name', 'Enter a style name.'), 'warning');
        return;
    }
    if (editorData.styles[name]) {
        showToast(tt('toast_style_name_exists', 'A style with that name already exists.'), 'warning');
        return;
    }
    editorData.styles[name] = getStyleByName(getSelectedStyleName());
    hideNewStyleInput();
    updateStyleSelector();
    setSelectedStyleName(name);
    const ids = currentAreaId ? [currentAreaId] : editorData.selection;
    if (ids.length) assignSelectedStyle(name, ids);
    updateStyleControls();
}

function startDeleteSelectedStyle() {
    const name = getSelectedStyleName();
    const styleNames = Object.keys(editorData.styles);
    if (styleNames.length <= 1) {
        return;
    }
    const assignedIds = getAreasUsingStyle(name);
    if (assignedIds.length == 0) {
        deleteStyle(name, styleNames.find(styleName => styleName != name) ?? DEFAULT_STYLE_NAME);
        return;
    }
    showStyleDeleteDialog(name, assignedIds.length);
}

function getAreasUsingStyle(name) {
    return Object.keys(editorData.areas).filter(id => getStyleNameForArea(editorData.areas[id]) == name);
}

function showStyleDeleteDialog(name, assignedCount) {
    pendingStyleDeleteName = name;
    const $dialog = $editor.find('.eim-style-delete-dialog');
    const $select = $dialog.find('[data-eim-style-delete-reassign]');
    $select.empty();
    Object.keys(editorData.styles).forEach(styleName => {
        if (styleName == name) return;
        $('<option></option>').attr('value', styleName).text(styleName).appendTo($select);
    });
    $dialog.find('[data-eim-style-delete-message]').text(tt('dialog_style_delete_message', 'Style "{name}" is assigned to {count} area(s). Choose a replacement style before deleting it.', {
        name: name,
        count: assignedCount,
    }));
    $dialog.css('display', 'flex');
}

function hideStyleDeleteDialog() {
    pendingStyleDeleteName = '';
    $editor.find('.eim-style-delete-dialog').hide();
}

function showSaveConflictDialog(message) {
    const $dialog = $editor.find('.eim-save-conflict-dialog');
    $dialog.find('[data-eim-save-conflict-message]').text(message || tt('dialog_save_conflict_message', 'The Easy Imagemap configuration changed after you opened the designer. Overwrite it with your current version?'));
    $dialog.css('display', 'flex');
}

function hideSaveConflictDialog() {
    $editor.find('.eim-save-conflict-dialog').hide();
}

function showSaveBlockedDialog(message) {
    const $dialog = $editor.find('.eim-save-blocked-dialog');
    $dialog.find('[data-eim-save-blocked-message]').text(message || tt('dialog_save_blocked_message', 'This Easy Imagemap configuration cannot be saved right now.'));
    $dialog.css('display', 'flex');
}

function hideSaveBlockedDialog() {
    $editor.find('.eim-save-blocked-dialog').hide();
}

function confirmStyleDelete() {
    const name = pendingStyleDeleteName;
    const replacement = $editor.find('[data-eim-style-delete-reassign]').val();
    hideStyleDeleteDialog();
    deleteStyle(name, replacement);
}

function deleteStyle(name, replacement) {
    name = normalizeStyleName(name);
    replacement = normalizeStyleName(replacement);
    if (!name || !editorData.styles[name] || Object.keys(editorData.styles).length <= 1) return;
    if (!replacement || replacement == name || !editorData.styles[replacement]) {
        replacement = Object.keys(editorData.styles).find(styleName => styleName != name) ?? DEFAULT_STYLE_NAME;
    }
    getAreasUsingStyle(name).forEach(id => {
        editorData.areas[id].style = replacement;
    });
    delete editorData.styles[name];
    setSelectedStyleName(replacement);
    updateStyleSelector();
    Object.keys(editorData.areas).forEach(id => updateBackgroundShape(id, id == currentAreaId));
    updateStyleControls();
}

function setAreaMode(mode, ids) {
    if (!['2-way', 'to-target', 'from-target'].includes(mode)) return;
    for (const id of ids) {
        if (editorData.areas[id]) editorData.areas[id].mode = mode;
    }
    updateModeButtons();
}

function updateModeButtons() {
    const mode = currentAreaId && editorData.areas[currentAreaId] ? editorData.areas[currentAreaId].mode : '';
    const actions = {
        '2-way': 'mode-two-way',
        'to-target': 'mode-to-target',
        'from-target': 'mode-from-target',
    };
    for (const key in actions) {
        const $btn = $('button[data-action="' + actions[key] + '"]');
        $btn.toggleClass('btn-primary', key == mode).toggleClass('btn-outline-primary', key != mode);
    }
}

function removeAreaById(id) {
    if (!id || !editorData.areas[id]) return;
    if (id == currentAreaId) clearCurrentArea();
    delete editorData.areas[id];
    const $row = $('tr[data-area-id="' + id + '"]');
    // @ts-ignore
    $row.find('select.assignables').selectpicker('destroy');
    $row.remove();
    $svg.find('[data-id="' + id + '"]').remove();
    removeFromSelection([id]);
}

function dropAreasWithoutShape() {
    Object.keys(editorData.areas).forEach(id => {
        if (!areaHasData(editorData.areas[id])) {
            removeAreaById(id);
        }
    });
    showWhenNoAreas();
}

function saveMap(overwrite) {
    clearCurrentArea();
    dropAreasWithoutShape();
    const data = {
        fieldName: editorData.fieldName,
        formName: editorData.formName,
        bounds: editorData.bounds,
        configHash: editorData.configHash ?? '',
        overwrite: overwrite === true,
        'two-way': $editor.find('input[name=two-way]').prop('checked'),
        styles: stylesToMap(),
        map: areasToMap(),
    };
    JSMO.ajax('save-map', data).then(function(response) {
        handleSaveResponse(response);
    }).catch(function(err) {
        showToast(tt('toast_failed_save', 'Failed to save data. Check console for details.'), 'error');
        error(err);
    });
}

function handleSaveResponse(response) {
    if (!response || !response.status) {
        showSaveBlockedDialog(tt('dialog_save_missing_response', 'The save request did not complete. Reload the Online Designer and try again.'));
        error(response);
        return;
    }
    if (response && response.status == 'conflict') {
        showSaveConflictDialog(response.message);
        return;
    }
    if (response.status == 'blocked') {
        showSaveBlockedDialog(response.message);
        return;
    }
    if (response.configHash) {
        editorData.configHash = response.configHash;
    }
    hideSaveConflictDialog();
    hideSaveBlockedDialog();
    if (response.status == 'unchanged') {
        showToast(response.message || tt('toast_no_changes', 'No changes to save.'), 'info');
    }
    else if (response.status == 'saved') {
        showToast(tt('toast_saved', 'Map data was successfully saved.'), 'success');
    }
    else {
        showSaveBlockedDialog(tt('dialog_save_unexpected_response', 'The save request returned an unexpected status. Reload the Online Designer and try again.'));
        error(response);
        return;
    }
    executeEditorAction('cancel', $());
}


//#region Action Dispatcher


function executeEditorAction(action, $row, event) {
    if (action) {
        log('Editor action: ' + action)
    }
    switch (action) {
        //#region Main Toolbar
        case 'preview': {
            applyZoom('zoom1x');
            togglePreview();
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
        case 'type-circle':
        case 'type-poly':
        case 'type-rect':
        case 'type-ell': {
            setShapeType(action.replace('type-', ''));
        }
        break;
        case 'shape-change-confirm': {
            confirmShapeChange();
        }
        break;
        case 'shape-change-cancel': {
            hideShapeChangeDialog();
        }
        break;
        case 'style-panel-show': {
            showStylePanel();
        }
        break;
        case 'style-panel-hide': {
            hideStylePanel();
        }
        break;
        case 'style-regular':
        case 'style-hover':
        case 'style-selected': {
            setStyleState(action.replace('style-', ''));
        }
        break;
        case 'style-apply-to-selected': {
            applyStyleToSelected();
        }
        break;
        case 'style-select': {
            assignSelectedStyle(getSelectedStyleName(), currentAreaId ? [currentAreaId] : editorData.selection);
        }
        break;
        case 'style-add-start': {
            showNewStyleInput();
        }
        break;
        case 'style-add-confirm': {
            addNamedStyle();
        }
        break;
        case 'style-add-cancel': {
            hideNewStyleInput();
        }
        break;
        case 'style-delete-start': {
            startDeleteSelectedStyle();
        }
        break;
        case 'style-delete-confirm': {
            confirmStyleDelete();
        }
        break;
        case 'style-delete-cancel': {
            hideStyleDeleteDialog();
        }
        break;
        case 'save-conflict-confirm': {
            hideSaveConflictDialog();
            saveMap(true);
        }
        break;
        case 'save-conflict-cancel': {
            hideSaveConflictDialog();
        }
        break;
        case 'save-blocked-close': {
            hideSaveBlockedDialog();
        }
        break;
        case 'style-copy': {
            copyStyleState();
        }
        break;
        case 'style-paste': {
            pasteStyleState();
        }
        break;
        case 'style-sync-states': {
            syncStyleStates();
        }
        break;
        case 'mode-two-way': {
            setAreaMode('2-way', currentAreaId ? [currentAreaId] : editorData.selection);
        }
        break;
        case 'mode-to-target': {
            setAreaMode('to-target', currentAreaId ? [currentAreaId] : editorData.selection);
        }
        break;
        case 'mode-from-target': {
            setAreaMode('from-target', currentAreaId ? [currentAreaId] : editorData.selection);
        }
        break;
        case 'mode-apply-to-selected': {
            if (currentAreaId) setAreaMode(editorData.areas[currentAreaId].mode, editorData.selection);
        }
        break;
        //#endregion


        case 'assign-target': {
            const id = $row.attr('data-area-id');
            const code = $row.find('select').val();
            editorData.areas[id].target = code;
            sanitizeAssignableButton($row.find('select.assignables'));
        }
        break;
        case 'style-change': {
            const $target = $(event.target);
            const prop = $target.attr('data-style-prop') ?? '';
            const value = $target.val();
            if (prop) applyStyleChange(prop, value);
        }
        break;
        case 'toggle-select-all': {
            toggleSelectAll();
            $('[data-action="toggle-select-all"]')[0].blur();
        }
        break;
        case 'reset-area':
            clearCurrentArea();
            $('[data-action="reset-area"]')[0].blur();
        break;
        //
        //#region Area Actions
        //
        case 'edit-area': {
            const id = $row.attr('data-area-id');
            setMode('edit');
            setCurrentEditArea(id);
        }
        break;
        case 'select-area': {
            const id = $row.attr('data-area-id');
            const checked = $row.find('input[data-action="select-area"]').prop('checked');
            log('Select area ' + id + ': ' + (checked ? 'Checked' : 'Unchecked'));
            if (checked) {
                addToSelection([id]);
            }
            else {
                removeFromSelection([id]);
            }
        }
        break;
        case 'add-area': {
            const id = $row.attr('data-area-id') ?? '';
            const uuid = addNewArea();
            addTableRow(uuid, id);
            showWhenNoAreas();
            if (editorData.mode == 'edit') {
                setCurrentEditArea(uuid);
            }
        }
        break;
        case 'duplicate-area': {
            const id = $row.attr('data-area-id') ?? '';
            const uuid = cloneArea(id);
            addTableRow(uuid, id);
            showWhenNoAreas();
            if (editorData.mode == 'edit') {
                setCurrentEditArea(uuid);
            }
        }
        break;
        case 'remove-area': {
            const id = $row.attr('data-area-id');
            removeAreaById(id);
            showWhenNoAreas();
        }
        break;
        case 'remove-selected-areas': {
            const ids = editorData.selection.slice();
            ids.forEach(removeAreaById);
            showWhenNoAreas();
        }
        break;
        //#endregion
        //#region Exit Editor
        case 'cancel': {
            // Reset
            applyZoom('zoom1x');
            editorData = null;
            // @ts-ignore
            $editor.find('select.assignables').selectpicker('destroy');
            cleanupAssignableSelectpickerContainers();
            hideShapeChangeDialog();
            hideStyleDeleteDialog();
            hideSaveConflictDialog();
            hideSaveBlockedDialog();
            hideStylePanel();
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
            saveMap(false);
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
 * @param {'info'|'warning'|'error'|'success'|'dark'|'light'|boolean} type
 * @param {number} delay
 * @param {string|null} title
 */
function showToast(msg, type = 'success', delay = 1000, title = null) {
    if (type === true) type = 'error';
    if (type === false) type = 'success';
    const toastType = ['info', 'warning', 'error', 'success', 'dark', 'light'].includes(type) ? type : 'success';
    const toastTitle = title || getToastTitle(toastType);
    // @ts-ignore
    const toastId = window.showToast(toastTitle, msg, toastType, delay);
    if (toastType == 'error') {
        error($('#' + toastId).text());
    }
}

function tt(key, fallback, replacements = {}) {
    let text = (config.lang && config.lang[key]) ? config.lang[key] : fallback;
    Object.keys(replacements).forEach(name => {
        text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), replacements[name]);
    });
    return text;
}

function getToastTitle(type) {
    const labels = {
        error: getLangLabel('global_01', 'ERROR'),
        warning: getLangLabel('global_48', 'WARNING'),
        success: getLangLabel('global_79', 'SUCCESS!'),
        info: tt('app_title', 'Easy Imagemap'),
        dark: tt('app_title', 'Easy Imagemap'),
        light: tt('app_title', 'Easy Imagemap'),
    };
    return labels[type] ?? tt('app_title', 'Easy Imagemap');
}

function getLangLabel(key, fallback) {
    // @ts-ignore
    return window.lang && window.lang[key] ? window.lang[key] : fallback;
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
