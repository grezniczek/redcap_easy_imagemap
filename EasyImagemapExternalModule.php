<?php

namespace DE\RUB\EasyImagemapExternalModule;

use Exception;
use Files;
use RCView;
use Survey;
use UserRights;

require_once "classes/ActionTagHelper.php";
require_once "classes/InjectionHelper.php";
require_once "classes/MapDataHelper.php";

class EasyImagemapExternalModule extends \ExternalModules\AbstractExternalModule
{
    private $js_debug = false;

    /** @var \Project */
    private $proj = null;
    private $project_id = null;

    const ACTIONTAG = "@EASYIMAGEMAP";

    #region Hooks

    function redcap_data_entry_form($project_id, $record, $instrument, $event_id, $group_id, $repeat_instance)
    {
        $this->init_proj($project_id);
        $this->init_config();
        $map_fields = $this->get_qualifying_fields($instrument);
        if (count($map_fields)) {
            $this->display_imagemaps($map_fields, $instrument, false);
        }
    }

    function redcap_survey_page($project_id, $record, $instrument, $event_id, $group_id, $survey_hash, $response_id, $repeat_instance)
    {
        $this->init_proj($project_id);
        $this->init_config();
        // We need to find the fields that are displayed on this particular survey page
        $forms = $this->get_project_forms();
        $survey_id = $forms[$instrument]["survey_id"];
        $multi_page = $this->proj->surveys[$survey_id]["question_by_section"] == "1";
        $page = $multi_page ? intval($_GET["__page__"]) : 1;
        list($page_fields, $_) = Survey::getPageFields($instrument, $multi_page);
        $page_fields = $page_fields[$page];
        $map_fields = $this->get_qualifying_fields($instrument);
        // Only consider the map fields that are actually on the survey page
        $map_fields = array_intersect_key($map_fields, array_flip($page_fields));
        if (count($map_fields)) {
            $this->display_imagemaps($map_fields, $page_fields, true);
        }
    }

    function redcap_every_page_top($project_id)
    {
        // Skip non-project context
        if ($project_id == null) return;
        // Act based on the page that is being displayed
        $page = defined("PAGE") ? PAGE : "";
        $form = $_GET["page"] ?? "";
        // Return if not on Online Designer / form edit mode
        if ($page != "Design/online_designer.php" || $form == "") return;
        // Also, ensure there is a user with desgin rights
        $user_name = $_SESSION["username"] ?? false;
        $privileges = $user_name ? UserRights::getPrivileges($project_id, $user_name)[$project_id][$user_name] : false;
        $design_rights = $privileges && $privileges["design"] == "1";
        if (!$design_rights) return;

        // Initialize
        $this->init_proj($project_id);
        $this->init_config();
        // Setup the Online Designer integration
        $this->setup_online_designer($form);
    }

    function redcap_module_ajax($action, $payload, $project_id, $record, $instrument, $event_id, $repeat_instance, $survey_hash, $response_id, $survey_queue_hash, $page, $page_full, $user_id, $group_id)
    {
        $this->init_proj($project_id);
        $user = $this->framework->getUser($user_id);
        $rights = $user->getRights($project_id);
        // All actions require design rights
        if ($rights["design"] == "1") {
            switch ($action) {
                case "get-fields":
                    return $this->get_qualifying_fields($payload);
    
                case "edit-map":
                    return $this->get_field_info($payload);
    
                case "save-map":
                    return $this->save_eim_data($payload);
            }
        }
        return null;
    }

    #endregion

    #region Data Entry / Survey Display

    /**
     * Injects the code necessary for rendering imagemaps on data entry or survey pages.
     * @param string[] $map_fields 
     * @param string|string[] $formOrFormFields
     * @param boolean $inline_js 
     */
    private function display_imagemaps($map_fields, $formOrFormFields, $inline_js)
    {
        $this->require_proj();
        $config = array(
            "version" => $this->VERSION,
            "debug" => $this->js_debug,
            "hashes" => [],
            "lang" => $this->get_js_lang(),
        );
        $page_fields = is_array($formOrFormFields) ? $formOrFormFields : $this->get_form_fields($formOrFormFields);
        // Process all map fields and assemble metadata needed for map rendering
        $warnings = [];
        $errors = [];
        $maps = [];
        $targets = [];
        foreach ($map_fields as $map_field_name => $edoc_hash) {
            $areas = [];
            $mf_meta = $this->get_field_info($map_field_name);
            $map_targets = [];
            foreach ($mf_meta["map"] as $_ => $map) {
                if (($map["target"] ?? "") == "") continue; // Skip when no target is set
                if (strpos($map["target"], ":") === false) {
                    $warnings[] = $this->tt_format("warning_invalid_target_removed", $map["target"]);
                    continue;
                }
                list($target_field, $code) = explode(":", $map["target"], 2);
                try {
                    $target_field_info = $this->get_field_metadata($target_field);
                }
                catch (\Throwable $_) {
                    $errors[] = $this->tt_format("warning_target_field_missing_removed", $target_field);
                    continue;
                }
                $target_type = $target_field_info["element_type"];
                $target_enum = parseEnum($target_field_info["element_enum"]);
                // Does the field exist?
                if (in_array($target_field, $page_fields, true)) {
                    // Does the code exist?
                    if (($code == "" && $target_type != "checkbox") || array_key_exists($code, $target_enum)) {
                        $area = [
                            "target" => $target_field,
                            "mode" => $map["mode"] ?? "2-way",
                            "code" => $code,
                            "tooltip" => $map["tooltip"] ?? false,
                            "label" => empty($map["label"]) ? ($target_enum[$code] ?? $this->tt("option_empty_reset")) : $map["label"],
                            "style" => $map["style"] ?? MapDataHelper::DEFAULT_STYLE_NAME,
                        ];
                        $hasShape = false;
                        foreach (['poly', 'rect', 'circle', 'ell'] as $shape) {
                            if (isset($map[$shape]) && !empty($map[$shape])) {
                                $area[$shape] = $map[$shape];
                                $hasShape = true;
                            }
                        }
                        if ($hasShape) {
                            $areas[] = $area;
                        }
                        else {
                            $warnings[] = $this->tt_format("warning_target_no_shape_removed", $target_field, $code);
                        }
                    } else {
                        $warnings[] = $this->tt_format("warning_target_no_option_removed", $target_field, $code);
                    }
                    $map_targets[$target_field] = $target_type;
                } else {
                    $errors[] = $this->tt_format("warning_target_not_on_page_removed", $target_field);
                }
            }
            if (count($mf_meta["map"] ?? [])) {
                $config["hashes"][$edoc_hash] = $map_field_name;
                $maps[$map_field_name]["hash"] = $edoc_hash;
                $maps[$map_field_name]["areas"] = $areas;
                $maps[$map_field_name]["bounds"] = $mf_meta["bounds"];
                $maps[$map_field_name]["styles"] = $mf_meta["styles"];
                $targets = array_merge($targets, $map_targets);
            }
        }
        $config["maps"] = $maps;
        $config["targets"] = $targets;
        if ($this->js_debug) {
            $config["warnings"] = array_unique($warnings);
            $config["errors"] = array_unique($errors);
        }

        // Output JS and init code
        $ih = InjectionHelper::init($this);
        $ih->js("js/EasyImagemap-Display.js", $inline_js);
        $ih->css("css/EasyImagemap-Display.css", $inline_js);
        $this->initializeJavascriptModuleObject();
        $jsmo_name = $this->getJavascriptModuleObjectName();
        print \RCView::script("DE_RUB_EasyImagemap.init(".json_encode($config).", $jsmo_name);");
    }

    #endregion

    #region Online Designer Integration

    private function setup_online_designer($form)
    {
        $this->require_proj();
        $fields = $this->get_qualifying_fields($form);
        $ih = InjectionHelper::init($this);
        $ih->css("css/EasyImagemap-OnlineDesigner.css");
        $ih->js("js/EasyImagemap-OnlineDesigner.js");
        $config = [
            "debug" => $this->js_debug,
            "mode" => "OnlineDesigner",
            "version" => $this->VERSION,
            "fields" => $fields,
            "form" => $form,
            "lang" => $this->get_js_lang(),
        ];
        $this->initializeJavascriptModuleObject();
        $jsmo_name = $this->getJavascriptModuleObjectName();

        #region Scripts and HTML
    ?>
        <script>
            $(function() {
                DE_RUB_EasyImagemap.init(<?= json_encode($config) ?>, <?= $jsmo_name ?>);
            });
        </script>
        <?php
        #region Editor Modal
        ?>
        <div id="eim-editor-tooltip" style="position:absolute;display:none;"></div>
        <div class="eim-editor modal" tabindex="-1" role="dialog" aria-labelledby="eim-editor-title" data-bs-keyboard="false">
            <div class="modal-dialog modal-fullscreen modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="eim-editor-title mb-1">
                            <i class="fa-solid fa-draw-polygon eim-icon me-1"></i>
                            <span id="eim-editor-title">
                                <b><?= $this->tt_esc("app_title") ?></b> &ndash; <?= $this->tt_esc("designer_editing_field") ?>
                                <span class="field-name"></span>
                            </span>
                        </div>
                        <div class="btn-toolbar mt-2" role="toolbar" aria-label="<?= $this->tt_esc("aria_main_toolbar") ?>">
                            <div class="btn-group btn-group-sm me-1" role="group" aria-label="<?= $this->tt_esc("aria_preview_controls") ?>">
                                <button type="button" data-action="preview" class="btn btn-outline-primary">
                                    <i class="fa-solid fa-eye"></i> <?= $this->tt_esc("button_preview") ?>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="<?= $this->tt_esc("aria_magnification_controls") ?>">
                                <button type="button" class="btn btn-outline-secondary" disabled>
                                    <i class="fa-solid fa-search"></i>
                                </button>
                                <button type="button" data-action="zoom1x" class="btn btn-secondary zoombutton-active" title="<?= $this->tt_esc("tooltip_zoom_100") ?>">
                                    1x
                                </button>
                                <button type="button" data-action="zoom2x" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_zoom_200") ?>">
                                    2x
                                </button>
                                <button type="button" data-action="zoom3x" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_zoom_300") ?>">
                                    3x
                                </button>
                                <button type="button" data-action="zoom4x" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_zoom_400") ?>">
                                    4x
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="<?= $this->tt_esc("aria_edit_mode") ?>">
                                <button type="button" class="btn btn-outline-secondary text-dark" disabled>
                                    <?= $this->tt_esc("toolbar_mode") ?>
                                </button>
                                <button type="button" data-action="mode-edit" class="btn btn-secondary" title="<?= $this->tt_esc("tooltip_edit_shapes") ?>">
                                    <i class="fa-solid fa-pen-nib"></i>
                                </button>
                                <button type="button" data-action="mode-move" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_move_shapes") ?>">
                                    <i class="fa-solid fa-arrows-up-down-left-right"></i>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="<?= $this->tt_esc("aria_shape_type") ?>">
                                <button type="button" class="btn btn-outline-secondary text-dark" disabled>
                                    <?= $this->tt_esc("toolbar_shape") ?>
                                </button>
                                <button type="button" data-action="type-circle" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_shape_circle") ?>">
                                    <i class="fa-regular fa-circle"></i>
                                </button>
                                <button type="button" data-action="type-ell" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_shape_ellipse") ?>">
                                    <i class="fa-solid fa-circle-notch"></i>
                                </button>
                                <button type="button" data-action="type-rect" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_shape_rectangle") ?>">
                                    <i class="fa-regular fa-square"></i>
                                </button>
                                <button type="button" data-action="type-poly" class="btn btn-secondary" title="<?= $this->tt_esc("tooltip_shape_polygon") ?>">
                                    <i class="fa-solid fa-draw-polygon"></i>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="<?= $this->tt_esc("aria_update_mode") ?>">
                                <button class="btn btn-outline-primary text-dark" disabled><?= $this->tt_esc("toolbar_update") ?></button>
                                <button data-action="mode-two-way" class="btn btn-outline-primary" title="<?= $this->tt_esc("tooltip_mode_two_way") ?>">
                                    <i class="fa-solid fa-exchange-alt"></i>
                                </button>
                                <button data-action="mode-to-target" class="btn btn-outline-primary" title="<?= $this->tt_esc("tooltip_mode_to_target") ?>">
                                    <i class="fa-solid fa-right-to-bracket"></i>
                                </button>
                                <button data-action="mode-from-target" class="btn btn-outline-primary" title="<?= $this->tt_esc("tooltip_mode_from_target") ?>">
                                    <i class="fa-solid fa-right-from-bracket fa-rotate-180"></i>
                                </button>
                                <button data-action="mode-apply-to-selected" class="btn btn-outline-primary" title="<?= $this->tt_esc("tooltip_mode_apply_selected") ?>">
                                    <i class="fa-regular fa-pen-to-square"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="eim-shape-change-dialog" role="dialog" aria-modal="true" aria-labelledby="eim-shape-change-title" style="display:none;">
                        <div class="eim-shape-change-card">
                            <h5 id="eim-shape-change-title"><?= $this->tt_esc("dialog_shape_change_title") ?></h5>
                            <p>
                                <?= $this->tt_esc("dialog_shape_change_intro") ?>
                            </p>
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" data-eim-shape-change-skip>
                                <span class="form-check-label"><?= $this->tt_esc("label_do_not_ask_again") ?></span>
                            </label>
                            <div class="eim-shape-change-actions">
                                <button type="button" data-action="shape-change-cancel" class="btn btn-secondary btn-sm"><?= $this->tt_esc("button_cancel") ?></button>
                                <button type="button" data-action="shape-change-confirm" class="btn btn-primary btn-sm"><?= $this->tt_esc("button_convert_shape") ?></button>
                            </div>
                        </div>
                    </div>
                    <div class="eim-style-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="eim-style-delete-title" style="display:none;">
                        <div class="eim-shape-change-card">
                            <h5 id="eim-style-delete-title"><?= $this->tt_esc("dialog_style_delete_title") ?></h5>
                            <p data-eim-style-delete-message>
                                <?= $this->tt_esc("dialog_style_delete_intro") ?>
                            </p>
                            <label class="eim-style-delete-reassign">
                                <?= $this->tt_esc("label_reassign_areas_to") ?>
                                <select data-eim-style-delete-reassign class="form-control form-control-sm"></select>
                            </label>
                            <div class="eim-shape-change-actions">
                                <button type="button" data-action="style-delete-cancel" class="btn btn-secondary btn-sm"><?= $this->tt_esc("button_cancel") ?></button>
                                <button type="button" data-action="style-delete-confirm" class="btn btn-danger btn-sm"><?= $this->tt_esc("button_delete_style") ?></button>
                            </div>
                        </div>
                    </div>
                    <div class="eim-save-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="eim-save-conflict-title" style="display:none;">
                        <div class="eim-shape-change-card">
                            <h5 id="eim-save-conflict-title"><?= $this->tt_esc("dialog_save_conflict_title") ?></h5>
                            <p data-eim-save-conflict-message>
                                <?= $this->tt_esc("dialog_save_conflict_message") ?>
                            </p>
                            <div class="eim-shape-change-actions">
                                <button type="button" data-action="save-conflict-cancel" class="btn btn-secondary btn-sm"><?= $this->tt_esc("button_no") ?></button>
                                <button type="button" data-action="save-conflict-confirm" class="btn btn-danger btn-sm"><?= $this->tt_esc("button_overwrite") ?></button>
                            </div>
                        </div>
                    </div>
                    <div class="eim-save-blocked-dialog" role="dialog" aria-modal="true" aria-labelledby="eim-save-blocked-title" style="display:none;">
                        <div class="eim-shape-change-card">
                            <h5 id="eim-save-blocked-title"><?= RCView::tt("global_01") // ERROR ?></h5>
                            <p data-eim-save-blocked-message>
                                <?= $this->tt_esc("dialog_save_blocked_message") ?>
                            </p>
                            <div class="eim-shape-change-actions">
                                <button type="button" data-action="save-blocked-close" class="btn btn-secondary btn-sm"><?= RCView::tt("global_53") // Cancel ?></button>
                            </div>
                        </div>
                    </div>
                    <div class="eim-unsaved-changes-dialog" role="dialog" aria-modal="true" aria-labelledby="eim-unsaved-changes-title" style="display:none;">
                        <div class="eim-shape-change-card">
                            <h5 id="eim-unsaved-changes-title"><?= $this->tt_esc("dialog_unsaved_changes_title") ?></h5>
                            <p>
                                <?= $this->tt_esc("dialog_unsaved_changes_message") ?>
                            </p>
                            <div class="eim-shape-change-actions">
                                <button type="button" data-action="unsaved-discard-cancel" class="btn btn-secondary btn-sm"><?= $this->tt_esc("button_stay") ?></button>
                                <button type="button" data-action="unsaved-discard-confirm" class="btn btn-danger btn-sm"><?= $this->tt_esc("button_discard_changes") ?></button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="area-assignments">
                            <div class="area-assignments-intro">
                                <?= $this->tt_esc("designer_intro") ?>
                            </div>
                            <button type="button" data-action="style-panel-show" class="btn btn-outline-secondary btn-sm eim-style-panel-toggle">
                                <i class="fa-solid fa-palette"></i> <?= $this->tt_esc("style_panel_title") ?>
                            </button>
                            <div class="eim-style-panel" style="display:none;">
                                <div class="eim-style-panel-title">
                                    <span><i class="fa-solid fa-palette"></i> <?= $this->tt_esc("style_panel_title") ?></span>
                                    <button type="button" data-action="style-panel-hide" class="btn btn-link btn-sm" title="<?= $this->tt_esc("tooltip_hide_style_panel") ?>">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                                <div class="eim-style-selector">
                                    <select data-action="style-select" class="form-control form-control-sm" title="<?= $this->tt_esc("label_style") ?>"></select>
                                    <button type="button" data-action="style-add-start" class="btn btn-outline-secondary btn-sm" title="<?= $this->tt_esc("tooltip_add_new_style") ?>">
                                        <i class="fa-solid fa-add"></i>
                                    </button>
                                    <span class="eim-disabled-tooltip-wrapper" data-style-delete-wrapper title="<?= $this->tt_esc("tooltip_delete_style") ?>">
                                        <button type="button" data-action="style-delete-start" class="btn btn-outline-danger btn-sm">
                                            <i class="fa-regular fa-trash-alt"></i>
                                        </button>
                                    </span>
                                    <button type="button" data-action="style-apply-to-selected" class="btn btn-outline-secondary btn-sm" title="<?= $this->tt_esc("tooltip_apply_style_selected") ?>">
                                        <i class="fa-regular fa-pen-to-square"></i>
                                    </button>
                                </div>
                                <div class="eim-style-new" style="display:none;">
                                    <input type="text" class="form-control form-control-sm" data-style-new-name placeholder="<?= $this->tt_esc("placeholder_new_style_name") ?>" maxlength="64">
                                    <button type="button" data-action="style-add-confirm" class="btn btn-primary btn-sm" title="<?= $this->tt_esc("tooltip_create_style") ?>">
                                        <i class="fa-solid fa-check"></i>
                                    </button>
                                    <button type="button" data-action="style-add-cancel" class="btn btn-outline-secondary btn-sm" title="<?= $this->tt_esc("button_cancel") ?>">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                                <div class="eim-style-states">
                                    <button type="button" data-action="style-regular" class="eim-style-state active" title="<?= $this->tt_esc("tooltip_edit_normal_style") ?>">
                                        <span class="eim-state-label"><?= $this->tt_esc("style_state_normal") ?></span>
                                        <span class="eim-state-swatch" data-style-state-preview="regular"></span>
                                    </button>
                                    <button type="button" data-action="style-hover" class="eim-style-state" title="<?= $this->tt_esc("tooltip_edit_hover_style") ?>">
                                        <span class="eim-state-label"><?= $this->tt_esc("style_state_hover") ?></span>
                                        <span class="eim-state-swatch" data-style-state-preview="hover"></span>
                                    </button>
                                    <button type="button" data-action="style-selected" class="eim-style-state" title="<?= $this->tt_esc("tooltip_edit_selected_style") ?>">
                                        <span class="eim-state-label"><?= $this->tt_esc("style_state_selected") ?></span>
                                        <span class="eim-state-swatch" data-style-state-preview="selected"></span>
                                    </button>
                                </div>
                                <div class="eim-style-grid">
                                    <span class="eim-style-control"><input type="color" data-action="style-change" data-style-prop="fill" value="#ffa500" aria-label="<?= $this->tt_esc("style_prop_fill") ?>"> <span aria-hidden="true"><?= $this->tt_esc("style_prop_fill") ?></span></span>
                                    <span class="eim-style-control"><input type="color" data-action="style-change" data-style-prop="stroke" value="#ffa500" aria-label="<?= $this->tt_esc("style_prop_stroke") ?>"> <span aria-hidden="true"><?= $this->tt_esc("style_prop_stroke") ?></span></span>
                                    <label class="eim-style-control"><input type="number" data-action="style-change" data-style-prop="fillOpacity" min="0" max="1" step="0.05" value="0.05"> <?= $this->tt_esc("style_prop_fill_opacity") ?></label>
                                    <label class="eim-style-control"><input type="number" data-action="style-change" data-style-prop="strokeOpacity" min="0" max="1" step="0.05" value="1"> <?= $this->tt_esc("style_prop_stroke_opacity") ?></label>
                                    <div class="eim-style-actions btn-group btn-group-xs" role="group" aria-label="<?= $this->tt_esc("aria_style_copy_sync") ?>">
                                        <button type="button" data-action="style-copy" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_copy_style_state") ?>">
                                            <i class="fa-regular fa-copy"></i>
                                        </button>
                                        <button type="button" data-action="style-paste" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_paste_style_state") ?>">
                                            <i class="fa-regular fa-paste"></i>
                                        </button>
                                        <button type="button" data-action="style-sync-states" class="btn btn-outline-secondary" title="<?= $this->tt_esc("tooltip_sync_style_states") ?>">
                                            <i class="fa-solid fa-link"></i>
                                        </button>
                                    </div>
                                    <label class="eim-style-control"><input type="number" data-action="style-change" data-style-prop="strokeWidth" min="0" max="20" step="0.5" value="1"> <?= $this->tt_esc("style_prop_stroke_width") ?></label>
                                </div>
                            </div>
                            <div class="area-assignments-table">
                                <table class="table eim-areas table-sm">
                                    <thead>
                                        <tr>
                                            <th><!-- Drag handle --></th>
                                            <th scope="col" class="text-center eim-col-edit" title="<?= $this->tt_esc("table_col_edit") ?>">
                                                <a data-action="reset-area" href="javascript:;"><i class="fa-solid fa-pencil"></i></a>
                                            </th>
                                            <th scope="col" class="text-center eim-col-select" title="<?= $this->tt_esc("table_col_select") ?>">
                                                <a data-action="toggle-select-all" href="javascript:;"><i class="fa-solid fa-check"></i></a>
                                            </th>
                                            <th scope="col" class="text-center eim-col-style" title="<?= $this->tt_esc("tooltip_style_preview_col") ?>"><i class="fa-solid fa-palette"></i></th>
                                            <th scope="col" class="eim-col-target"><?= $this->tt_esc("table_col_target") ?></th>
                                            <th scope="col" class="eim-col-actions"><?= $this->tt_esc("table_col_action") ?></th>
                                        </tr>
                                    </thead>
                                    <tbody class="area-list empty-on-close"></tbody>
                                    <template data-eim-template="area-row">
                                        <tr data-area-id class="area">
                                            <td class="drag-handle" draggable="true">
                                                <div draggable="area">
                                                    <i class="fa-solid fa-ellipsis-vertical" draggable="area"></i>
                                                </div>
                                            </td>
                                            <td class="text-center">
                                                <input class="form-check-input" type="radio" name="active-area" value="" data-action="edit-area">
                                            </td>
                                            <td class="text-center">
                                                <input class="form-check-input" type="checkbox" name="checked-area" value="" data-action="select-area">
                                            </td>
                                            <td class="text-center">
                                                <div class="area-style-sample"></div>
                                            </td>
                                            <td>
                                                <div class="form-inline" data-action="assign-target">
                                                    <select data-live-search="true" class="form-control form-control-sm assignables" data-width="100%">
                                                        <!-- Assignable field options -->
                                                    </select>
                                                </div>
                                            </td>
                                            <td>
                                                <button data-action="add-area" class="btn btn-default btn-xs eim-action-btn-xs" title="<?= $this->tt_esc("tooltip_add_area_after") ?>">
                                                    <i class="fa-solid fa-add"></i>
                                                </button>
                                                <button data-action="duplicate-area" class="btn btn-default btn-xs eim-action-btn-xs" title="<?= $this->tt_esc("tooltip_duplicate_area") ?>">
                                                    <i class="fa-solid fa-clone"></i>
                                                </button>
                                                <button data-action="remove-area" class="btn btn-default btn-xs eim-action-btn-xs" title="<?= $this->tt_esc("tooltip_remove_area") ?>">
                                                    <i class="fa-solid fa-trash-can text-danger"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    </template>
                                </table>
                                <p class="show-when-no-areas"><i><?= $this->tt_esc("message_no_areas") ?></i>
                                    <button data-action="add-area" class="btn btn-success btn-xs"><i class="fa-solid fa-add"></i></button>
                                </p>
                            </div>
                        </div>
                        <div id="eim-container" class="empty-on-close"></div>
                    </div>
                    <div class="modal-footer">
                        <button data-action="remove-selected-areas" class="btn btn-xs text-danger" style="margin-right:auto;"><i class="fa-regular fa-trash-alt"></i> <?= $this->tt_esc("button_remove_selected_areas") ?></button>
                        <button data-action="cancel" type="button" class="btn btn-secondary btn-sm"><?= RCView::tt("global_53") // Cancel 
                                                                                                    ?></button>
                        <button data-action="apply" type="button" class="btn btn-success btn-sm"><i class="fa-solid fa-save"></i> &nbsp; <?= RCView::tt("report_builder_28") // Save Changes 
                                                                                                                                            ?></button>
                    </div>
                </div>
            </div>
        </div>
<?php
        #endregion

    }

    #endregion

    #region Private Helpers

    private function tt_esc($key)
    {
        return htmlspecialchars($this->tt($key), ENT_QUOTES);
    }

    private function tt_format($key, ...$args)
    {
        return sprintf($this->tt($key), ...$args);
    }

    private function get_js_lang()
    {
        $keys = [
            "app_title",
            "button_configure_imagemap",
            "option_not_assigned",
            "target_used_marker",
            "tooltip_target_already_assigned",
            "toast_failed_initialize_area",
            "toast_enter_style_name",
            "toast_style_name_exists",
            "toast_failed_save",
            "toast_no_changes",
            "toast_saved",
            "dialog_shape_change_message",
            "shape_circle",
            "shape_ellipse",
            "shape_rectangle",
            "shape_polygon",
            "shape_unknown",
            "tooltip_delete_style",
            "tooltip_delete_style_disabled",
            "style_name_base",
            "dialog_style_delete_message",
            "dialog_save_conflict_message",
            "dialog_save_blocked_message",
            "dialog_save_missing_response",
            "dialog_save_unexpected_response",
            "display_failed_setup_map",
            "display_failed_add_interactivity",
        ];
        $lang = [];
        foreach ($keys as $key) {
            $lang[$key] = $this->tt($key);
        }
        return $lang;
    }

    /**
     * Gets field and other metadata needed for the Online Designer integration
     * @param string $field_name 
     * @return array 
     */
    private function get_field_info($field_name)
    {
        $this->require_proj();
        $tagname = self::ACTIONTAG;
        $field = $this->get_field_metadata($field_name);
        $form_name = $field["form_name"];
        $qualified_fields = $this->get_qualifying_fields($form_name);
        // Does it have the action tag?
        if (!array_key_exists($field_name, $qualified_fields)) {
            throw new Exception($this->tt_format("error_field_not_marked", $field_name, $tagname));
        }
        // Extract action tag parameter.
        $tags = ActionTagHelper::parseActionTags($field["misc"], self::ACTIONTAG);
        $tag = array_pop($tags);
        $params = trim($tag["params"]);
        if ($params == "") $params = "{}";
        try {
            $params = json_decode($params, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $_) {
            throw new Exception($this->tt_format("error_parse_actiontag", $tagname, $field_name));
        }
        $assignables = array();
        $form_fields = $this->get_form_fields($form_name);
        foreach ($form_fields as $this_field_name) {
            if ($this_field_name == "{$form_name}_complete") continue; // Skip form status field
            $this_field = $this->get_field_metadata($this_field_name);
            $this_type = $this_field["element_type"];
            $this_icon = $this_type == "checkbox" ? "<i class=\"fa-regular fa-check-square\"></i>" : "<i class=\"fa-solid fa-dot-circle\"></i>";
            if (in_array($this_type, ["checkbox", "radio", "select", "yesno", "truefalse"])) {
                $enum = parseEnum($this_field["element_enum"]);
                if (count($enum)) {
                    $options = [];
                    if ($this_type != "checkbox") {
                        $options[] = array(
                            "code" => "{$this_field_name}:",
                            "label" => $this->tt("option_empty_reset"),
                        );
                    }
                    foreach ($enum as $code => $label) {
                        $options[] = array(
                            "code" => "{$this_field_name}:{$code}",
                            "label" => strip_tags($label),
                        );
                    }
                    $assignables[] = array(
                        "name" => $this_field_name,
                        "label" => strip_tags($this_field["element_label"]),
                        "type" => $this_type,
                        "icon" => $this_icon,
                        "options" => $options,
                    );
                }
            }
        }
        $map_config = MapDataHelper::normalize($params);
        return [
            "fieldName" => $field_name,
            "formName" => $form_name,
            "hash" => $qualified_fields[$field_name],
            "configHash" => $this->get_map_config_hash($map_config),
            "map" => $map_config["shapes"],
            "bounds" => $map_config["bounds"],
            "styles" => $map_config["styles"],
            "assignables" => $assignables,
        ];
    }

    /**
     * Gets a list of qualifying field on the specified form (i.e. descriptive with displayed image and the action tag)
     * @param string $project_id 
     * @param string $form 
     * @return array 
     */
    private function get_qualifying_fields($form)
    {
        $this->require_proj();
        $fields = [];
        $forms = $this->get_project_forms();
        if (!isset($forms[$form])) {
            throw new Exception($this->tt_format("error_form_missing", $form));
        }
        foreach ($forms[$form]["fields"] as $field_name => $_) {
            $field_meta = $this->get_field_metadata($field_name);
            if (
                $field_meta["element_type"] == "descriptive" &&
                $field_meta["edoc_id"] &&
                $field_meta["edoc_display_img"] == "1") {
                $tags = ActionTagHelper::parseActionTags($field_meta["misc"], self::ACTIONTAG);
                if (is_array($tags) && count($tags)) {
                    $fields[$field_name] = Files::docIdHash($field_meta["edoc_id"], $this->get_salt());
                }
            }
        }
        return $fields;
    }

    /**
     * Saves designer data in a field's Action Tag / Field Annotation ('misc')
     * @param Array $data 
     * @return array
     * @throws Exception Throws in case of failure
     */
    private function save_eim_data($data)
    {
        $this->require_proj();
        $save_block_message = $this->get_designer_save_block_message();
        if ($save_block_message !== "") {
            return [
                "status" => "blocked",
                "message" => $save_block_message,
            ];
        }
        $field_name = $data["fieldName"];
        $form_name = $data["formName"];
        $map = $data["map"] ?? [];
        $loaded_hash = (string)($data["configHash"] ?? "");
        $overwrite = !empty($data["overwrite"]);
        $qualified_fields = $this->get_qualifying_fields($form_name);
        if (!array_key_exists($field_name, $qualified_fields)) {
            throw new Exception($this->tt_format("error_invalid_save_operation", $field_name, $form_name));
        }
        $field_data = $this->get_field_metadata($field_name);
        $at = ActionTagHelper::parseActionTags($field_data["misc"], self::ACTIONTAG);
        $at = array_pop($at);
        $search = $at["match"];
        $current_params = trim($at["params"]);
        if ($current_params == "") $current_params = "{}";
        try {
            $current_params = json_decode($current_params, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $_) {
            throw new Exception($this->tt_format("error_parse_actiontag", self::ACTIONTAG, $field_name));
        }
        $current_store = MapDataHelper::normalize($current_params);
        $current_hash = $this->get_map_config_hash($current_store);
        $store = MapDataHelper::normalize([
            "version" => MapDataHelper::SCHEMA_VERSION,
            "shapes" => $map,
            "bounds" => $data["bounds"] ?? [],
            "styles" => $data["styles"] ?? [],
        ]);
        $new_hash = $this->get_map_config_hash($store);
        if (hash_equals($current_hash, $new_hash)) {
            return [
                "status" => "unchanged",
                "configHash" => $current_hash,
                "message" => $this->tt("toast_no_changes"),
            ];
        }
        if ($loaded_hash !== "" && !hash_equals($current_hash, $loaded_hash) && !$overwrite) {
            return [
                "status" => "conflict",
                "configHash" => $current_hash,
                "message" => $this->tt("dialog_save_conflict_message"),
            ];
        }
        $this->validate_map_config($form_name, $store);
        $json = json_encode($store, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        $replace = $at["actiontag"] . "=" . $json;
        $misc = trim(str_replace($search, $replace, $field_data["misc"]));
        $metadata_table = $this->get_project_metadata_table();
        // Update field
        $sql = "UPDATE `$metadata_table` SET `misc` = ? WHERE `project_id` = ? AND `field_name` = ?";
        $q = db_query($sql, [$misc, $this->project_id, $field_name]);
        if (!$q) {
            throw new Exception($this->tt_format("error_db_update_failed", db_error()));
        }
        \REDCap::logEvent(
            "Design",
            $this->tt_format("log_config_saved", $field_name, $form_name, count($store["shapes"]), count($store["styles"])),
            $sql,
            null,
            null,
            $this->project_id
        );
        return [
            "status" => "saved",
            "configHash" => $new_hash,
        ];
    }

    private function validate_map_config($form_name, $store)
    {
        if (!is_array($store["bounds"] ?? null)) {
            throw new Exception($this->tt("error_bounds_missing"));
        }
        if (!isset($store["bounds"]["width"]) || !isset($store["bounds"]["height"]) || $store["bounds"]["width"] <= 0 || $store["bounds"]["height"] <= 0) {
            throw new Exception($this->tt("error_bounds_dimensions"));
        }

        $form_fields = $this->get_form_fields($form_name);
        $styles = $store["styles"] ?? [];
        if (!is_array($styles) || !array_key_exists(MapDataHelper::DEFAULT_STYLE_NAME, $styles)) {
            throw new Exception($this->tt("error_default_style_missing"));
        }
        foreach (($store["shapes"] ?? []) as $idx => $shape) {
            $display_idx = $idx + 1;
            $shape_type = MapDataHelper::getShapeType($shape);
            if ($shape_type == "") {
                throw new Exception($this->tt_format("error_area_no_shape", $display_idx));
            }
            if (!in_array(($shape["mode"] ?? "2-way"), MapDataHelper::MODES, true)) {
                throw new Exception($this->tt_format("error_area_invalid_mode", $display_idx));
            }
            $style_name = MapDataHelper::normalizeStyleName($shape["style"] ?? MapDataHelper::DEFAULT_STYLE_NAME);
            if ($style_name === "" || !array_key_exists($style_name, $styles)) {
                throw new Exception($this->tt_format("error_area_unknown_style", $display_idx));
            }
            $target = $shape["target"] ?? "";
            if ($target == "") {
                continue;
            }
            if (strpos($target, ":") === false) {
                throw new Exception($this->tt_format("error_area_invalid_target", $display_idx));
            }
            list($target_field, $code) = explode(":", $target, 2);
            if (!in_array($target_field, $form_fields, true)) {
                throw new Exception($this->tt_format("error_area_target_not_on_instrument", $display_idx, $target_field));
            }
            $target_field_info = $this->get_field_metadata($target_field);
            $target_type = $target_field_info["element_type"];
            if (!in_array($target_type, ["checkbox", "radio", "select", "yesno", "truefalse"], true)) {
                throw new Exception($this->tt_format("error_area_target_unsupported", $display_idx, $target_field));
            }
            $target_enum = parseEnum($target_field_info["element_enum"]);
            if ($target_type == "checkbox" && $code == "") {
                throw new Exception($this->tt_format("error_area_checkbox_missing_code", $display_idx, $target_field));
            }
            if ($code != "" && !array_key_exists($code, $target_enum)) {
                throw new Exception($this->tt_format("error_area_unknown_choice_code", $display_idx, $target_field, $code));
            }
        }
    }

    private function get_project_forms()
    {
        $this->require_proj();
        return $this->is_draft_preview() ? $this->proj->forms_temp : $this->proj->getForms();
    }

    private function get_form_fields($form_name)
    {
        $this->require_proj();
        $forms = $this->get_project_forms();
        if (!isset($forms[$form_name])) {
            throw new Exception($this->tt_format("error_form_missing", $form_name));
        }
        return array_keys($forms[$form_name]["fields"]);
    }

    private function get_project_metadata()
    {
        $this->require_proj();
        return $this->is_draft_preview() ? $this->proj->metadata_temp : $this->proj->getMetadata();
    }

    private function get_field_metadata($field_name)
    {
        $this->require_proj();
        $meta = $this->get_project_metadata();
        if (!array_key_exists($field_name, $meta)) {
            throw new Exception($this->tt_format("error_field_missing", $field_name));
        }
        return $meta[$field_name];
    }

    private function get_project_metadata_table()
    {
        $this->require_proj();
        return $this->is_draft_preview() ? "redcap_metadata_temp" : "redcap_metadata";
    }

    private function get_designer_save_block_message()
    {
        $this->require_proj();
        if (intval($this->proj->project["status"] ?? 0) > 0 && intval($this->proj->project["draft_mode"] ?? 0) <= 0) {
            return $this->tt("error_prod_without_draft");
        }
        return "";
    }

    private function get_map_config_hash($store)
    {
        return hash("sha256", json_encode($store, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    private function is_draft_preview()
    {
        $this->require_proj();
        return intval($this->proj->project["status"] ?? 0) > 0 && intval($this->proj->project["draft_mode"]) > 0 && $GLOBALS["draft_preview_enabled"] == true;
    }

    private function get_salt()
    {
        $this->require_proj();
        return $this->proj->project["__SALT__"] ?? "--no-salt--";
    }


    private function init_proj($project_id)
    {
        if ($this->proj == null) {
            $this->proj = new \Project($project_id);
            $this->project_id = $project_id;
        }
    }

    private function require_proj()
    {
        if ($this->proj == null) {
            throw new Exception($this->tt("error_project_not_initialized"));
        }
    }

    private function init_config()
    {
        $this->require_proj();
        $setting = $this->getProjectSetting("javascript-debug");
        $this->js_debug = $setting == true;
    }

    #endregion

}
