# Easy Imagemap

Easy Imagemap is a REDCap External Module that turns an inline image in a descriptive field into an interactive image map. Areas on the image can update REDCap choice fields such as checkboxes, radio buttons, dropdowns, yes/no, and true/false fields.

The module is intentionally REDCap-native: the source image must be an inline image attached to a descriptive field in the data dictionary. External URLs and File Repository files are not supported for map sources, so the configuration remains auditable as part of project metadata.

## `@EASYIMAGEMAP`

Add `@EASYIMAGEMAP` to a descriptive field that has an inline image. In Online Designer, users with design rights will see a **Configure Imagemap** button on that field.

The designer saves map configuration as JSON in the action tag parameter. The action tag name stays stable:

```text
@EASYIMAGEMAP={
    "version": 1,
    "bounds": { "width": 500, "height": 467 },
    "shapes": []
}
```

The module can read empty parameters, current `shapes`/`bounds` JSON, and the older demo-style format that used numbered entries with `points`, `_w`, `_h`, and `field::code` targets. Legacy data is normalized in memory when displayed or edited. It is only rewritten to the canonical `version: 1` format when the map is saved from the designer.

## Supported Areas

The designer supports three area types:

- Polygon: `{ "poly": "x,y x,y x,y" }`
- Rectangle: `{ "rect": { "x": 10, "y": 20, "width": 100, "height": 80 } }`
- Ellipse: `{ "ell": { "cx": 60, "cy": 60, "rx": 40, "ry": 25 } }`

Each area may also include:

- `target`: `field_name:choice_code`, or `field_name:` for reset areas on radio-like fields
- `label`: optional display label override
- `tooltip`: optional tooltip text reserved for UI use
- `mode`: `2-way`, `to-target`, or `from-target`
- `style`: `regular`, `hover`, and `selected` state styles with fill/stroke colors, opacity, and stroke width

## Designer Workflow

Open **Configure Imagemap** from Online Designer. Add rows in the assignment table, choose a shape type, draw or edit the area on the image, and assign the row to a target field or choice.

Polygons are edited with point anchors. Rectangles are edited with two corner handles. Ellipses are edited with a center handle plus horizontal and vertical radius handles. Move mode can move one or more selected areas. The style panel edits regular, hover, and selected states, and can copy the active style state to selected areas.

## Data Entry And Surveys

On data entry forms and surveys, the module overlays SVG areas on the REDCap image. Clicking or tapping an area updates the configured REDCap field unless the area is configured as `from-target`. In `2-way` mode, changes to the REDCap field also update the selected state of the image area.

The overlay is responsive and follows REDCap image fitting, including survey/mobile layouts. Multi-page surveys only initialize maps whose descriptive field and target fields are on the current survey page.

## Deployment Notes

Changing the map in Online Designer rewrites the `@EASYIMAGEMAP` parameter to canonical JSON. For production projects that already use this module, deploy code and project metadata updates together if you plan to save existing maps with the revised designer.

Invalid JSON in the action tag remains a hard error and must be fixed manually. Invalid individual areas are skipped during display when possible, and save-time validation prevents incomplete or invalid designer areas from being silently persisted.
