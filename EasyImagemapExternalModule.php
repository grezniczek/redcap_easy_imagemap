<?php

namespace DE\RUB\EasyImagemapExternalModule;

use Exception;
use Files;
use RCView;
use Survey;
use UserRights;

require_once "classes/ActionTagHelper.php";
require_once "classes/InjectionHelper.php";

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
        switch ($action) {
            case "get-fields":
                return $this->get_qualifying_fields($payload);

            case "edit-map":
                return $this->get_field_info($payload);

            case "save-map":
                return $this->save_eim_data($payload);

            default:
                return null;
        }
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
                list($target_field, $code) = explode(":", $map["target"], 2);
                $target_field_info = $this->get_field_metadata($target_field);
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
                            "label" => empty($map["label"]) ? $target_enum[$code] : $map["label"],
                            "style" => $map["style"] ?? [],
                        ];
                        $hasShape = false;
                        foreach (['poly', 'rect', 'ell'] as $shape) {
                            if (isset($map[$shape]) && !empty($map[$shape])) {
                                $area[$shape] = $map[$shape];
                                $hasShape = true;
                            }
                        }
                        if ($hasShape) {
                            $areas[] = $area;
                        }
                        else {
                            $warnings[] = "Target field '$target_field' has no valid shape for '$code'. The corresponding map has been removed.";
                        }
                    } else {
                        $warnings[] = "Target field '$target_field' has no matching option for '$code'. The corresponding map has been removed.";
                    }
                    $map_targets[$target_field] = $target_type;
                } else {
                    $errors[] = "Target field '$target_field' is not on this data entry form or survey page. The corresponding map has been removed.";
                }
            }
            if (count($mf_meta["map"] ?? [])) {
                $config["hashes"][$edoc_hash] = $map_field_name;
                $maps[$map_field_name]["hash"] = $edoc_hash;
                $maps[$map_field_name]["areas"] = $areas;
                $maps[$map_field_name]["bounds"] = $mf_meta["bounds"];
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
                                <b>Easy Imagemap</b> &ndash; Editing field:
                                <span class="field-name"></span>
                            </span>
                        </div>
                        <div class="btn-toolbar mt-2" role="toolbar" aria-label="Main toolbar">
                            <div class="btn-group btn-group-sm me-1" role="group" aria-label="Preview controls">
                                <button type="button" data-action="preview" class="btn btn-outline-primary">
                                    <i class="fa-solid fa-eye"></i> Preview
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="Magnification controls">
                                <button type="button" class="btn btn-outline-secondary" disabled>
                                    <i class="fa-solid fa-search"></i>
                                </button>
                                <button type="button" data-action="zoom1x" class="btn btn-secondary zoombutton-active" title="Set zoom to 100%">
                                    1x
                                </button>
                                <button type="button" data-action="zoom2x" class="btn btn-outline-secondary" title="Set zoom to 200%">
                                    2x
                                </button>
                                <button type="button" data-action="zoom3x" class="btn btn-outline-secondary" title="Set zoom to 300%">
                                    3x
                                </button>
                                <button type="button" data-action="zoom4x" class="btn btn-outline-secondary" title="Set zoom to 400%">
                                    4x
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="Edit mode">
                                <button type="button" class="btn btn-outline-secondary text-dark" disabled>
                                    Mode
                                </button>
                                <button type="button" data-action="mode-edit" class="btn btn-secondary" title="Edit shapes">
                                    <i class="fa-solid fa-pen-nib"></i>
                                </button>
                                <button type="button" data-action="mode-move" class="btn btn-outline-secondary" title="Move shapes">
                                    <i class="fa-solid fa-arrows-up-down-left-right"></i>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="Shape type">
                                <button type="button" class="btn btn-outline-secondary text-dark" disabled>
                                    Shape
                                </button>
                                <button type="button" data-action="type-ell" class="btn btn-secondary" title="Set shape to ellipse">
                                    <i class="fa-regular fa-circle"></i>
                                </button>
                                <button type="button" data-action="type-rect" class="btn btn-outline-secondary" title="Set shape to rectangle">
                                    <i class="fa-regular fa-square"></i>
                                </button>
                                <button type="button" data-action="type-poly" class="btn btn-outline-secondary" title="Set shape to polygon">
                                    <i class="fa-solid fa-draw-polygon"></i>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="Styling">
                                <button class="btn btn-outline-primary text-dark" disabled>Style</button>
                                <button data-action="style-regular" class="btn btn-outline-primary" title="Set regular style">
                                    <i class="fa-regular fa-square"></i>
                                </button>
                                <button data-action="style-hover" class="btn btn-outline-primary" title="Set style on hover">
                                    <i class="fa-solid fa-arrow-pointer"></i>
                                </button>
                                <button data-action="style-selected" class="btn btn-outline-primary" title="Set style on selection">
                                    <i class="fa-solid fa-square-check"></i>
                                </button>
                                <button data-action="style-apply-to-selected" class="btn btn-outline-primary" title="Apply to selected targets">
                                    <i class="fa-regular fa-pen-to-square"></i>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="Update mode">
                                <button class="btn btn-outline-primary text-dark" disabled>Update</button>
                                <button data-action="mode-two-way" class="btn btn-outline-primary" title="Two-way update">
                                    <i class="fa-solid fa-exchange-alt"></i>
                                </button>
                                <button data-action="mode-to-target" class="btn btn-outline-primary" title="One-way update to target">
                                    <i class="fa-solid fa-right-to-bracket"></i>
                                </button>
                                <button data-action="mode-from-target" class="btn btn-outline-primary" title="One-way update from target">
                                    <i class="fa-solid fa-right-from-bracket fa-rotate-180"></i>
                                </button>
                                <button data-action="mode-apply-to-selected" class="btn btn-outline-primary" title="Apply to selected targets">
                                    <i class="fa-regular fa-pen-to-square"></i>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm me-2" role="group" aria-label="Settings">
                                <button data-action="change-settings" class="btn btn-outline-secondary" title="Edit settings">
                                    <i class="fa-solid fa-cog"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="area-assignments">
                            <div class="area-assignments-intro">
                                Add or edit areas, then assign them to a target (field or choice).
                            </div>
                            <div class="area-assignments-table">
                                <table class="table eim-areas table-sm">
                                    <thead>
                                        <tr>
                                            <th><!-- Drag handle --></th>
                                            <th scope="col" class="text-center eim-col-edit" title="Edit">
                                                <a data-action="reset-area" href="javascript:;"><i class="fa-solid fa-pencil"></i></a>
                                            </th>
                                            <th scope="col" class="text-center eim-col-select" title="Select">
                                                <a data-action="toggle-select-all" href="javascript:;"><i class="fa-solid fa-check"></i></a>
                                            </th>
                                            <th scope="col" class="text-center eim-col-style" title="Style preview. Move the mouse over the preview to see the hover style; check a row to see the checked style."><i class="fa-solid fa-palette"></i></th>
                                            <th scope="col" class="eim-col-target">Target</th>
                                            <th scope="col" class="eim-col-actions">Action</th>
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
                                                <button data-action="add-area" class="btn btn-default btn-xs" title="Add new row after this one">
                                                    <i class="fa-solid fa-add"></i>
                                                </button>
                                                <button data-action="duplicate-area" class="btn btn-default btn-xs" title="Add a new row based on this one">
                                                    <i class="fa-solid fa-clone"></i>
                                                </button>
                                                <button data-action="remove-area" class="btn btn-default btn-xs" title="Remove this row">
                                                    <i class="fa-solid fa-trash-can text-danger"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    </template>
                                </table>
                                <p class="show-when-no-areas"><i>No areas have been defined yet.</i>
                                    <button data-action="add-area" class="btn btn-success btn-xs"><i class="fa-solid fa-add"></i></button>
                                </p>
                            </div>
                        </div>
                        <div id="eim-container" class="empty-on-close"></div>
                    </div>
                    <div class="modal-footer">
                        <button data-action="remove-selected-areas" class="btn btn-xs text-danger" style="margin-right:auto;"><i class="fa-regular fa-trash-alt"></i> Remove selected areas</button>
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
            throw new Exception("Field '$field_name' is not marked with $tagname!");
        }
        // Extract action tag parameter. The parameter is a JSON string that must be wrapped in single quotes!
        $tag = array_pop(ActionTagHelper::parseActionTags($field["misc"], self::ACTIONTAG));
        $params = trim($tag["params"]);
        if ($params == "") $params = "{}";
        try {
            $params = json_decode($params, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $_) {
            throw new Exception("Failed to parse $tagname parameter for field '$field_name' (invalid JSON). Fix or remove/reset it manually!");
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
                            "label" => "(empty/reset)",
                        );
                    }
                    foreach ($enum as $code => $label) {
                        $options[] = array(
                            "code" => "{$this_field_name}:{$code}",
                            "label" => $label,
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
        return [
            "fieldName" => $field_name,
            "formName" => $form_name,
            "hash" => $qualified_fields[$field_name],
            "map" => empty($params) ? [] : $params["shapes"],
            "bounds" => empty($params) ? [] : $params["bounds"],
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
            throw new Exception("Form '$form' does not exist!");
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
     * @return true 
     * @throws Exception Throws in case of failure
     */
    private function save_eim_data($data)
    {
        $this->require_proj();
        $field_name = $data["fieldName"];
        $form_name = $data["formName"];
        $map = $data["map"];
        $qualified_fields = $this->get_qualifying_fields($form_name);
        if (!array_key_exists($field_name, $qualified_fields)) {
            throw new Exception("Invalid operation: Field '$field_name' is not on instrument '$form_name' or does not have the required action tag or properties.");
        }
        $field_data = $this->get_field_metadata($field_name);
        $at = array_pop(ActionTagHelper::parseActionTags($field_data["misc"], self::ACTIONTAG));
        $search = $at["match"];
        $store = [
            "shapes" => $map,
            "bounds" => $data["bounds"],
        ];
        $json = json_encode($store, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        $replace = $at["actiontag"] . "=" . $json;
        $misc = trim(str_replace($search, $replace, $field_data["misc"]));
        $metadata_table = $this->get_project_metadata_table();
        $field_name = db_escape($field_name);
        // Update field
        $sql = "UPDATE `$metadata_table` SET `misc` = ? WHERE `project_id` = ? AND `field_name` = ?";
        $q = db_query($sql, [$misc, $this->project_id, $field_name]);
        if (!$q) {
            throw new Exception("Failed to update the database. Error: " . db_error());
        }
        return true;
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
            throw new Exception("Form '$form_name' does not exist!");
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
            throw new Exception("Field '$field_name' does not exist!");
        }
        return $meta[$field_name];
    }

    private function get_project_metadata_table()
    {
        $this->require_proj();
        return $this->is_draft_preview() ? "redcap_metadata_temp" : "redcap_metadata";
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
            throw new Exception("Project not initialized");
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
