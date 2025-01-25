<?php namespace DE\RUB\EasyImagemapExternalModule;

use Exception;
use Files;
use RCView;
use Survey;
use UserRights;
use Vanderbilt\REDCap\Classes\ProjectDesigner;

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

    function redcap_data_entry_form($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $repeat_instance = 1) {
        $this->init_proj($project_id);
        $this->init_config();
        $map_fields = $this->get_qualifying_fields($instrument);
        if (count($map_fields)) {
            $this->display_imagemaps($map_fields, $instrument, false);
        }
    }

    function redcap_survey_page($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $survey_hash, $response_id = NULL, $repeat_instance = 1) {
        $this->init_proj($project_id);
        $this->init_config();
        // We need to find the fields that are displayed on this particular survey page
        $forms = $this->get_project_forms();
        $survey_id = $forms[$instrument]["survey_id"];
        $multi_page = $this->proj->surveys[$survey_id]["question_by_section"] == "1";
        $page = $multi_page ? intval($_GET["__page__"]) : 1;
        list ($page_fields, $_) = Survey::getPageFields($instrument, $multi_page);
        $page_fields = $page_fields[$page];
        $map_fields = $this->get_qualifying_fields($instrument);
        // Only consider the map fields that are actually on the survey page
        $map_fields = array_intersect_key($map_fields, array_flip($page_fields));
        if (count($map_fields)) {
            $this->display_imagemaps($map_fields, $page_fields, true);
        }
    }

    function redcap_every_page_top($project_id = null) {
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

    function redcap_module_ajax($action, $payload, $project_id, $record, $instrument, $event_id, $repeat_instance, $survey_hash, $response_id, $survey_queue_hash, $page, $page_full, $user_id, $group_id) {
        $this->init_proj($project_id);
        switch($action) {
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
     * @param string $form
     * @param boolean $inline_js 
     */
    private function display_imagemaps($map_fields, $form, $inline_js) {
        $this->require_proj();
        $config = array(
            "version" => $this->VERSION,
            "debug" => $this->js_debug,
        );
        $page_fields = $this->get_form_fields($form);
        // Process all map fields and assemble metadata needed for map rendering
        $warnings = [];
        $errors = [];
        $maps = [];
        $areas = [];
        $targets = [];
        foreach ($map_fields as $map_field_name => $edoc_hash) {
            $mf_meta = $this->get_field_metadata($map_field_name);
            $map_targets = [];
            foreach ($mf_meta["map"] as $_ => $map) {
                list($target_field, $code) = explode("::", $map["target"], 2);
                $target_field_info = $this->get_field_metadata($target_field);
                $target_type = $target_field_info["element_type"];
                $target_enum = parseEnum($target_field_info["element_enum"]);
                // Does the field exist?
                if (in_array($target_field, $page_fields, true)) {
                    // Does the code exist?
                    if (($code == "" && $target_type != "checkbox") || array_key_exists($code, $target_enum)) {
                        $areas[] = [
                            "points" => $map["points"],
                            "target" => $target_field,
                            "code" => $code,
                            "tooltip" => $map["tooltip"] ?? false,
                            "label" => empty($map["label"]) ? $target_enum[$code] : $map["label"],
                        ];
                    }
                    else {
                        $warnings[] = "Target field '$target_field' has no matching option for '$code'. The correspinding map has been removed.";
                    }
                    $map_targets[$target_field] = $target_type;
                }
                else {
                    $errors[] = "Target field '$target_field' is not on this data entry form or survey page. The correspinding map has been removed.";
                }
            }
            if (count($mf_meta["map"] ?? [])) {
                $maps[$map_field_name]["hash"] = $edoc_hash;
                $maps[$map_field_name]["areas"] = $areas;
                $maps[$map_field_name]["bounds"] = $mf_meta["bounds"];
                $maps[$map_field_name]["two-way"] = $mf_meta["two-way"];
                $targets = array_merge($targets, $map_targets);
            }
        }
        $config["maps"] = $maps;
        $config["targets"] = $targets;
        if ($this->js_debug) {
            $config["warnings"] = array_unique($warnings);
            $config["errors"] = array_unique($errors);
        }

        $ih = InjectionHelper::init($this);
        $ih->js("js/EasyImagemap-Display.js", $inline_js);
        ?>
        <script>
            $(function() {
                DE_RUB_EasyImagemap.init(<?=json_encode($config)?>);
            });
        </script>
        <?php
        #endregion
    }

    #endregion

    #region Online Designer Integration

    private function setup_online_designer($form) {
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
                DE_RUB_EasyImagemap.init(<?=json_encode($config)?>, <?=$jsmo_name?>);
            });
        </script>
        <?php
        #region Editor Modal
        ?>
        <div id="easy-imagemap-editor-tooltip" style="position:absolute;display:none;"></div>
        <div class="easy-imagemap-editor modal" tabindex="-1" role="dialog" aria-labelledby="easy-imagemap-editor-title" aria-hidden="true">
            <div class="modal-dialog modal-fullscreen modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="eim-editor-title mb-1">
                            <i class="fa-solid fa-draw-polygon eim-icon me-1"></i>
                            <span id="easy-imagemap-editor-title">
                                Easy Imagemap &ndash; Editing field: 
                                <span class="field-name"></span>
                            </span>
                        </div>
                        <div class="eim-toolbar-top">
                            <button data-action="preview" class="btn btn-light btn-xs"><i class="fa-solid fa-eye"></i> Preview</button>
                            |
                            <button data-action="zoom1x" class="btn btn-light btn-xs zoombutton-active btn-dark"><i class="fa-solid fa-search"></i> 1x</button>
                            <button data-action="zoom2x" class="btn btn-light btn-xs"><i class="fa-solid fa-search"></i> 2x</button>
                            <button data-action="zoom3x" class="btn btn-light btn-xs"><i class="fa-solid fa-search"></i> 3x</button>
                            <button data-action="zoom4x" class="btn btn-light btn-xs"><i class="fa-solid fa-search"></i> 4x</button>
                        </div>
                    </div>
                    <div class="modal-body draw">
                        <div id="eim-container" class="empty-on-close"></div>
                    </div>
                    <div class="modal-body buttons">
                        <div>
                            
                            |
                            <div class="form-check form-check-inline">
                                <label class="form-check-label" for="eim-two-way">Two way updates:</label>
                                <input class="form-check-input ml-2" type="checkbox" id="eim-two-way" name="two-way" style="margin-top:0.2rem;" value="">
                            </div>
                            <div class="form-check form-check-inline ml-3">
                                <i class="fa-solid fa-palette"></i>&nbsp;Style:
                            </div>
                        </div>
                        <div class="mt-1">
                            <button data-action="style-regular" class="btn btn-light btn-sm">Regular:</button>
                            <div class="eim-style-button" id="eim-style-regular"></div>
                            <button data-action="style-hover" class="btn btn-light btn-sm">Hover:</button> 
                            <div class="eim-style-button" id="eim-style-hover"></div>
                            <button data-action="style-selected" class="btn btn-light btn-sm">Selected:</button> 
                            <div class="eim-style-button" id="eim-style-selected"></div>
                            <span class="ml-1">&mdash;</span>
                            <button data-action="style-apply" class="btn btn-default btn-sm">Apply to selected areas</button>
                        </div>
                        <div class="mt-2">
                            Add or edit areas, then assign them to checkbox or radio field options.
                        </div>
                    </div>
                    <div class="modal-body assign">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th scope="col"><i class="fa-solid fa-pencil"></i> Edit</th>
                                    <th scope="col"><a data-action="toggle-select-all" href="javascript:;"><i class="fa-solid fa-check"></i> Select</a></th>
                                    <th scope="col">
                                        <i class="fa-solid fa-exchange-alt"></i> Field
                                    </th>
                                    <th scope="col"><i class="fa-solid fa-palette"></i> Style</th>
                                    <th scope="col"><i class="fa-solid fa-bolt"></i> Actions</th>
                                </tr>
                            </thead>
                            <tbody class="area-list empty-on-close">
                            </tbody>
                            <template data-eim-template="area-row">
                                <tr data-area-id class="area" data-action="edit-area">
                                    <td>
                                        <div class="form-check form-check-inline">
                                            <input class="form-check-input ml-2" type="radio" name="active-area" value="">
                                        </div>
                                    </td>
                                    <td>
                                        <div data-action="select-area" class="form-check form-check-inline">
                                            <input class="form-check-input ml-2" type="checkbox" value="">
                                        </div>
                                    </td>
                                    <td>
                                        <div class="form-inline" data-action="assign-target">
                                            <select data-live-search="true" class="form-control form-control-sm assignables" data-width="90%">
                                                <!-- Assignable field options -->
                                            </select>
                                        </div>
                                    </td>
                                    <td>
                                        <button data-action="style-area" class="btn btn-default btn-sm">Style area</button>
                                        <div data-action="none" class="area-style-sample"></div>
                                    </td>
                                    <td>
                                        <button data-action="add-area" class="btn btn-default btn-xs"><i class="fa-solid fa-add"></i></button>
                                        <button data-action="duplicate-area" class="btn btn-default btn-xs"><i class="fa-solid fa-clone"></i></button>
                                        <button data-action="remove-area" class="btn btn-default btn-xs"><i class="fa-solid fa-trash text-danger"></i></button>
                                    </td>
                                </tr>
                            </template>
                        </table>
                        <p class="show-when-no-areas"><i>No areas have been defined yet.</i>
                            <button data-action="add-area" class="btn btn-success btn-xs"><i class="fa-solid fa-add"></i></button>
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button data-action="clear-areas" class="btn btn-link btn-xs text-danger" style="margin-right:auto;"><i class="fa-regular fa-trash-alt"></i> Reset (remove all areas)</button>
                        <button data-action="cancel" type="button" class="btn btn-secondary btn-sm"><?=RCView::tt("global_53") // Cancel ?></button>
                        <button data-action="apply" type="button" class="btn btn-success btn-sm"><i class="fa-solid fa-save"></i> &nbsp; <?=RCView::tt("report_builder_28") // Save Changes ?></button>
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
    private function get_field_info($field_name) {
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
        }
        catch(\Throwable $_) {
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
                            "code" => "{$this_field_name}::",
                            "label" => "(empty/reset)",
                        );
                    }
                    foreach ($enum as $code => $label) {
                        $options[] = array(
                            "code" => "{$this_field_name}::{$code}",
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
        $bounds = [
            "width" => $params["_w"] ?? 0,
            "height" => $params["_h"] ?? 0,
        ];
        $twoway = $params["_two-way"] ?? false;
        unset($params["_w"]);
        unset($params["_h"]);
        unset($params["_two-way"]);
        return [
            "fieldName" => $field_name,
            "formName" => $form_name,
            "hash" => $qualified_fields[$field_name],
            "map" => empty($params) ? [] : $params,
            "bounds" => $bounds,
            "two-way" => $twoway,
            "assignables" => $assignables,
        ];
    }

    /**
     * Gets a list of qualifying field on the specified form (i.e. descriptive with displayed image and the action tag)
     * @param string $project_id 
     * @param string $form 
     * @return array 
     */
    private function get_qualifying_fields($form) {
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
                $field_meta["edoc_display_img"] == "1" &&
                strpos($field_meta["misc"], self::ACTIONTAG) !== false
            ) {
                $fields[$field_name] = Files::docIdHash($field_meta["edoc_id"], $this->get_salt());
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
    private function save_eim_data($data) {
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
        $map["_w"] = $data["bounds"]["width"];
        $map["_h"] = $data["bounds"]["height"];
        $map["_two-way"] = $data["two-way"];
        $json = json_encode($map, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        $replace = $at["actiontag"]."=".$json;
        $misc = checkNull(trim(str_replace($search, $replace, $field_data["misc"])));
        $metadata_table = $this->get_project_metadata_table();
        $field_name = db_escape($field_name);
        // Update field
        $sql = "UPDATE `$metadata_table` SET `misc` = ? WHERE `project_id` = ? AND `field_name` = ?";
        $q = db_query($sql, [$misc, $this->project_id, $field_name]);
        if (!$q) {
            throw new Exception("Failed to update the database. Error: ". db_error());
        }
        return true;
    }

    private function get_project_forms() {
        $this->require_proj();
        return $this->is_draft_mode() ? $this->proj->forms_temp : $this->proj->getForms();
    }

    private function get_form_fields($form_name) {
        $this->require_proj();
        $forms = $this->get_project_forms();
        if (!isset($forms[$form_name])) {
            throw new Exception("Form '$form_name' does not exist!");
        }
        return array_keys($forms[$form_name]["fields"]);
    }

    private function get_project_metadata() {
        $this->require_proj();
        return $this->is_draft_mode() ? $this->proj->metadata_temp : $this->proj->getMetadata();
    }

    private function get_field_metadata($field_name) {
        $this->require_proj();
        $meta = $this->get_project_metadata();
        if (!array_key_exists($field_name, $meta)) {
            throw new Exception("Field '$field_name' does not exist!");
        }
        return $meta[$field_name];
    }

    private function get_project_metadata_table() {
        $this->require_proj();
        return $this->is_draft_mode() ? "redcap_metadata_temp" : "redcap_metadata";
    }

    private function is_draft_mode() {
        $this->require_proj();
        return intval($this->proj->project["status"] ?? 0) > 0;
    }

    private function get_salt() {
        $this->require_proj();
        return $this->proj->project["__SALT__"] ?? "--no-salt--";
    }


    private function init_proj($project_id) {
        if ($this->proj == null) {
            $this->proj = new \Project($project_id);
            $this->project_id = $project_id;
        }
    }

    private function require_proj() {
        if ($this->proj == null) {
            throw new Exception("Project not initialized");
        }
    }

    private function init_config() {
        $this->require_proj();
        $setting = $this->getProjectSetting("javascript-debug");
        $this->js_debug = $setting == true;
    }

    #endregion

}
