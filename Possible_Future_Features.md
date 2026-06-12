# Possible Future Features

This document collects ideas that go beyond the initial release scope of Easy Imagemap. The module is intentionally REDCap-native and should stay simple enough to maintain, so these ideas should be evaluated against real registry/survey workflows before implementation.

## Multi-Dimensional Area Inputs

Current maps mostly bind one image area to one REDCap target choice. A larger future feature would let a shape collect an additional dimension of information after it is activated.

Example use cases:

- Joint location plus pain severity.
- Body region plus symptom type.
- Wound location plus wound stage.
- Dental/tooth location plus finding category.
- Specimen region plus confidence or quality grade.

Possible mechanics:

- Clicking an area opens a small in-place selector next to the shape.
- The selector is backed by a second REDCap field, or by a paired target definition such as location field plus severity field.
- The secondary input could be a radio-like button group, slider, numeric stepper, select list, or compact visual scale.
- The visible area style could change based on the secondary value, for example by fill intensity or pattern.

Open design questions:

- Should the secondary value be stored in one shared REDCap field, one field per area, or one matrix-like field group?
- How should this work for surveys on small touch screens?
- Should the secondary selector appear on every click, only after a shape is selected, or only when the primary target becomes active?
- How should one-way and two-way bindings work when multiple REDCap fields are involved?
- What happens when a user clears the primary target? Should the secondary value clear automatically?

Implementation notes:

- Keep the canonical JSON extensible, for example by adding an optional `secondaryTarget` or `dimensions` object per shape.
- The display layer should degrade gracefully if a referenced secondary field is not present on the current survey page.
- Avoid building a general form engine inside the image map. Support a small number of REDCap-backed input types first.

## Advanced Shape Fills And Backgrounds

Current styles support fill color, stroke color, opacity, and stroke width for normal, hover, and selected states. A future version could support richer visual fills.

Possible fill types:

- Solid color, as currently implemented.
- Hatch or stripe patterns.
- Dot patterns.
- Gradients.
- Image fills.
- State-dependent pattern overlays, for example a diagonal stripe for selected areas.

Potential use cases:

- Differentiate tender, swollen, damaged, painful, or uncertain regions without relying only on hue.
- Improve accessibility for color-blind users.
- Show a small texture or icon-like pattern inside selected shapes.
- Let anatomical maps use domain-specific visual semantics, such as inflammation intensity.

Implementation notes:

- SVG `<pattern>` definitions are a natural fit for hatch/dot/image fills.
- Named styles could gain a `fillType` and associated fill configuration.
- Image fills need careful scope control. User-uploaded REDCap files may be difficult to reference safely and consistently across data entry, surveys, exports, and draft mode.
- Pattern presets are likely safer and easier than arbitrary uploaded images for the first version.

## Conditional Area Styling

Named styles are currently manually assigned to areas. A future enhancement could let styles react to REDCap values.

Examples:

- Use one style when a checkbox is checked and another when unchecked.
- Use different selected styles for severity values.
- Change opacity based on a numeric pain score.
- Highlight unmapped or incomplete areas during data entry.

Implementation notes:

- Start with simple state mappings rather than arbitrary JavaScript expressions.
- Keep the configuration inspectable in the action tag JSON.
- Make sure survey pages only evaluate fields that are actually present.

## Shape Groups And Layers

Large maps can contain many shapes. Grouping and layering could make both design and runtime behavior more manageable.

Possible features:

- Group multiple shapes under a label.
- Temporarily hide/show groups in the designer.
- Lock a group while editing other shapes.
- Apply a style or update mode to a group.
- Reorder layers when shapes overlap.

Use cases:

- Separate left/right side shapes.
- Separate overview body regions from zoomed inset regions.
- Keep annotation/helper shapes distinct from data-entry shapes.

Implementation notes:

- A lightweight `group` property on shapes may be enough.
- Avoid introducing a full layer panel unless real maps prove it necessary.

## Reusable Map Templates

Some maps will be useful across projects, especially common body maps or joint-count diagrams.

Possible features:

- Export a map configuration from one field.
- Import a map configuration into another field with target remapping.
- Bundle example maps with the module.
- Provide a template for common rheumatology joint counts.

Implementation notes:

- Target remapping is the hard part. A template should not silently save invalid targets.
- Import should show a field/choice mapping step before writing to the action tag.
- Template export should not include project-specific identifiers beyond field and choice names.

## Better Designer Navigation For Large Maps

The designer now supports zooming and auto-scroll to active areas. Larger maps may still benefit from navigation helpers.

Possible features:

- Mini-map overview.
- Search areas by target label.
- Filter the assignment table to unassigned, duplicate-assigned, or missing-shape rows.
- Jump to next unassigned area.
- Keyboard shortcuts for next/previous unassigned row.

Implementation notes:

- These should remain optional helper controls rather than adding a large navigation surface.
- The assignment table already carries most of the needed state.

## Improved Validation And Repair Tools

The module already validates targets and shape data. Future versions could expose more repair workflows in the designer.

Possible features:

- Show invalid targets inline in the assignment table.
- Offer a guided remap when a target field or choice code no longer exists.
- Warn when multiple areas target the same field/choice, with a quick filter.
- Detect shapes outside image bounds.
- Detect very small shapes that may be accidental.

Implementation notes:

- Validation should distinguish between hard save blockers and warnings.
- Duplicate assignments are sometimes intentional, so they should remain warnings, not errors.

## Runtime Tooltips And Legends

Maps could optionally present more user-facing guidance during data entry or survey use.

Possible features:

- Area labels on hover/tap.
- A compact legend explaining styles.
- A selected-area summary below the image.
- Touch-friendly long-press hints.

Implementation notes:

- Survey display must stay uncluttered.
- Tooltips should not interfere with REDCap validation messages or mobile scrolling.

## Accessibility Improvements

SVG image maps are inherently visual, but the module can still improve accessibility.

Possible features:

- Keyboard navigation between clickable areas on data entry/survey pages.
- ARIA labels derived from target labels.
- Visible focus states for SVG areas.
- Optional text list synchronized with the image map.
- Pattern-based selected states for users who cannot rely on color.

Implementation notes:

- Accessibility should be considered both in the designer and in runtime data entry/survey surfaces.
- A synchronized text list may be the most robust fallback for screen readers.

## Responsive And Touch Enhancements

Mobile/touch support is already first-class, but more polish is possible.

Possible features:

- Larger optional touch handles in the designer.
- Pinch-to-zoom in the designer.
- Better placement rules for popovers near viewport edges.
- Touch-friendly runtime tooltips or secondary selectors.

Implementation notes:

- REDCap pages vary by version/theme, so enhancements should rely on stable browser APIs and simple DOM structure.

## Audit And Export Helpers

For broader release and regulated use, project teams may want clearer ways to audit map configurations.

Possible features:

- Human-readable map summary export.
- List all shapes, targets, styles, and update modes.
- Flag invalid or duplicate targets.
- Include map configuration in documentation output.

Implementation notes:

- This could be a designer-only utility and should not affect runtime behavior.

## Possible Non-Goals

These ideas may be tempting but should probably remain out of scope unless a strong use case appears:

- Arbitrary HTML or remote image sources.
- A general-purpose drawing application inside REDCap.
- Free-form JavaScript conditions in map configuration.
- Complex animation effects.
- Cross-instrument or cross-event target binding.
- Storage outside REDCap metadata for ordinary map configuration.

## Suggested Prioritization

Near-term candidates:

- Inline validation and repair helpers.
- Assignment-table filters for unassigned/duplicate/missing-shape rows.
- Runtime labels/tooltips.
- Accessibility/focus improvements.

Medium-term candidates:

- Pattern fills.
- Conditional styles.
- Reusable map templates with target remapping.
- Better large-map navigation.

Large feature candidates:

- Multi-dimensional area inputs.
- Image fills.
- Full grouping/layer management.
