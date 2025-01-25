<?php namespace DE\RUB\EasyImagemapExternalModule;

use Exception;
use Files;
use RCView;
use Survey;
use UserRights;
use Vanderbilt\REDCap\Classes\ProjectDesigner;

require_once "classes/ActionTagHelper.php";

class EasyImagemapExternalModule extends \ExternalModules\AbstractExternalModule
{
    private $js_debug = false;
    static $PROJECT_CACHE = array();
    const ACTIONTAG = "@EASYIMAGEMAP";

    function __construct()
    {
        parent::__construct();

        // Load settings
        if ($this->getProjectId() !== null) {
            $this->js_debug = $this->getProjectSetting("javascript-debug") == true;
        }
    }

    #region Hooks

    function redcap_data_entry_form($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $repeat_instance = 1) {
        $map_fields = $this->easy_GetQualifyingFields($project_id, $instrument);
        if (count($map_fields)) {
            $Proj = $this->easy_GetProject($project_id);
            $page_fields = array_keys($Proj->forms[$instrument]["fields"]);
            $this->easy_DisplayImagemaps($project_id, $map_fields, $page_fields, false);
        }
    }

    function redcap_survey_page($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $survey_hash, $response_id = NULL, $repeat_instance = 1) {
        $Proj = $this->easy_GetProject($project_id);
        // We need to find the fields that are displayed on this particular survey page
        $survey_id = $Proj->forms[$instrument]["survey_id"];
        $multi_page = $Proj->surveys[$survey_id]["question_by_section"] == "1";
        $page = $multi_page ? intval($_GET["__page__"]) : 1;
        list ($page_fields, $_) = Survey::getPageFields($instrument, $multi_page);
        $page_fields = $page_fields[$page];
        $map_fields = $this->easy_GetQualifyingFields($project_id, $instrument);
        // Only consider the map fields that are actually on the survey page
        $map_fields = array_intersect_key($map_fields, array_flip($page_fields));
        if (count($map_fields)) {
            $this->easy_DisplayImagemaps($project_id, $map_fields, $page_fields, true);
        }
    }

    function redcap_every_page_top($project_id = null) {
        // Skip non-project context
        if ($project_id == null) return; 
        // Act based on the page that is being displayed
        $page = defined("PAGE") ? PAGE : "";
        // Is there a user?
        $user_name = $_SESSION["username"] ?? false;
        $privileges = $user_name ? UserRights::getPrivileges($project_id, $user_name)[$project_id][$user_name] : false;
        // Does the user have design rights?
        $design_rights = $privileges && $privileges["design"] == "1";
        // Online Designer
        if (strpos($page, "Design/online_designer.php") === 0 && $design_rights) {
            $form = $_GET["page"] ?? "";
            if ($form) {
                $Proj = self::easy_GetProject($project_id);
                if (isset($Proj->forms[$form])) {
                    $this->easy_OnlineDesigner($project_id, $form);
                }
            }
        }
    }

    function redcap_module_ajax($action, $payload, $project_id, $record, $instrument, $event_id, $repeat_instance, $survey_hash, $response_id, $survey_queue_hash, $page, $page_full, $user_id, $group_id) {
        switch($action) {
            case "get-fields":
                return $this->easy_GetQualifyingFields($project_id, $payload);

            case "edit-map":
                return $this->easy_GetFieldInfo($project_id, $payload);

            case "save-map":
                return $this->easy_SaveData($project_id, $payload);

            default:
                return null;
        }
    }

    #endregion

    #region Data Entry / Survey Display

    /**
     * Injects the code necessary for rendering imagemaps on data entry or survey pages.
     * @param string $project_id 
     * @param string[] $map_fields 
     * @param string[] $page_fields 
     * @param boolean $inline_js 
     */
    private function easy_DisplayImagemaps($project_id, $map_fields, $page_fields, $inline_js) {
        $config = array(
            "version" => $this->VERSION,
            "debug" => $this->js_debug,
        );
        
        $Proj = $this->easy_GetProject($project_id);
        
        // Process all map fields and assemble metadata needed for map rendering
        $warnings = [];
        $errors = [];
        $maps = [];
        $areas = [];
        $targets = [];
        foreach ($map_fields as $map_field_name => $edoc_hash) {
            $mf_meta = $this->easy_GetFieldInfo($project_id, $map_field_name);
            $map_targets = [];
            foreach ($mf_meta["map"] as $_ => $map) {
                list($target_field, $code) = explode("::", $map["target"], 2);
                $target_field_info = $Proj->metadata[$target_field];
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

        #region Script
        $js_file = "js/EasyImagemap-Display.js";
        if ($inline_js) {
            $js = file_get_contents($this->getModulePath().$js_file);
            $src = "";
        }
        else {
            $js = "";
            $src = " src=\"{$this->getUrl($js_file)}\"";
        }
        ?>
        <script<?= $src ?>><?= $js ?></script>
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

    private function easy_OnlineDesigner($project_id, $form) {

        $config = [
            "debug" => $this->js_debug,
            "mode" => "OnlineDesigner",
            "version" => $this->VERSION,
            "fields" => $this->easy_GetQualifyingFields($project_id, $form),
            "form" => $form,
        ];
        $this->initializeJavascriptModuleObject();
        $jsmo_name = $this->getJavascriptModuleObjectName();

        #region Scripts and HTML
        ?>
        <script src="<?php print $this->getUrl('js/EasyImagemap-OnlineDesigner.js'); ?>"></script>
        <script>
            $(function() {
                DE_RUB_EasyImagemap.init(<?=json_encode($config)?>, <?=$jsmo_name?>);
            });
        </script>
        <?php
        #region Editor Modal
        ?>
        <style>
            .easy-imagemap-editor {
                --stroke-width: 1
            }
            .easy-imagemap-editor .modal-header {
                padding: 0.5rem 1rem;
                font-size: 20px;
                display: block;
            }
            .easy-imagemap-editor .modal-header .eim-icon {
                font-size: 16px;
            }
            .eim-icon {
                color: orange;
            }
            .easy-imagemap-editor .modal-body {
                padding: 0.5rem 1rem;
            }
            .easy-imagemap-editor p {
                margin-top: 0;
            }
            .easy-imagemap-editor .area-style-sample {
                display: inline-block;
                width: 4rem;
                height: 1.9rem;
                background-color: aqua;
                position: absolute;
                margin-left: 10px;
            }
            .easy-imagemap-editor .field-name {
                font-weight: bold;
            }
            tr.area td {
                padding: 0.2rem !important;
            }
            tr.area .form-check {
                margin-top: 8px;
            }
            .assignables .badge {
                font-weight: normal !important;
            }
            .assignables .badge i {
                font-size: 70% !important;
            }
            .bootstrap-select .dropdown-menu li a {
                font-size: 13px;
            }
            .bootstrap-select .dropdown-menu li a:hover {
                font-size: 13px;
            }
            svg.eim-svg {
                position: absolute;
                left: 0;
                top: 0;
                cursor: crosshair;
                outline: 1px red dotted;
                outline-offset: -1px;
            }
            svg.eim-svg.inactive {
                cursor: not-allowed;
                outline-color: gray;
            }
            svg.eim-svg.preview {
                cursor: not-allowed;
                outline: 1px var(--info) solid;
            }
            svg.eim-svg .anchor {
                cursor: pointer;
                stroke: black;
                stroke-width: var(--stroke-width);
                fill: yellow;
                opacity: 0.7;
            }
            svg.eim-svg .anchor.active {
                stroke-width: calc(var(--stroke-width) * 2);
                fill: red;
            }
            svg.eim-svg polygon {
                stroke-width: 1;
                stroke: orange;
                fill: orange;
                opacity: 0.3;
            }
            svg.eim-svg polygon.background {
                cursor: pointer;
                stroke-width: 1;
                stroke: blueviolet;
                fill: blueviolet;
                opacity: 0.2;
            }
            svg.eim-svg polygon.background.active {
                display: none;
            }
            svg.eim-svg.preview {
                cursor: default;
                outline: 2px var(--bs-info) solid;
            }
            svg.eim-svg.preview polygon.background {
                opacity: 0;
                cursor: pointer;
            }
            svg.eim-svg.preview polygon.background.selected {
                opacity: 0.6;
            }
            svg.eim-svg.preview polygon.background:not(.selected):hover {
                opacity: 0.1;
            }
            #easy-imagemap-editor-tooltip {
                background: cornsilk;
                border: 1px solid black;
                border-radius: 2px;
                padding: 3px;
                z-index: 999999;
            }
            div.eim-style-button {
                margin-bottom: -8px;
                display: inline-block;
                width: 40px;
                height: 22px;
                outline-offset: 1px;
                outline: 1px black dotted;
            }
            .modal-body.draw {
                position: relative;
                max-height: 55%;
                max-width: 100%;
                overflow: auto;
                padding: 5px 15px;

            }
            #eim-container {
                position: relative;
                min-height: fit-content;
                padding: 0;
            }
            .modal-body.buttons {
                min-height: 114px;
            }
            .modal-body.assign {
                max-height: 40%;
            }
        </style>
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
                                <i class="fas fa-palette"></i>&nbsp;Style:
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
                        <button data-action="clear-areas" class="btn btn-link btn-xs text-danger" style="margin-right:auto;"><i class="far fa-trash-alt"></i> Reset (remove all areas)</button>
                        <button data-action="cancel" type="button" class="btn btn-secondary btn-sm"><?=RCView::tt("global_53") // Cancel ?></button>
                        <button data-action="apply" type="button" class="btn btn-success btn-sm"><i class="fas fa-save"></i> &nbsp; <?=RCView::tt("report_builder_28") // Save Changes ?></button>
                    </div>
                </div>
            </div>
        </div>
        <?php
        #endregion
        #region Toasts (HTML)
        ?>
        <!-- Success toast -->
        <div class="position-fixed bottom-0 right-0 p-3" style="z-index: 99999; right: 0; bottom: 0;">
            <div class="easy-imagemap-editor success-toast toast hide" role="alert" aria-live="assertive" aria-atomic="true" data-delay="2000" data-animation="true" data-autohide="true">
                <div class="toast-header">
                    <svg class="bd-placeholder-img rounded mr-2" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice" focusable="false">
                        <rect width="100%" height="100%" fill="#28a745"></rect>
                    </svg>
                    <strong class="mr-auto"><?=RCView::tt("multilang_100") // Success ?></strong>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="<?=RCView::tt_attr("calendar_popup_01") // Close ?>">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="toast-body" data-content="toast"></div>
            </div>
        </div>
        <!-- Error toast -->
        <div class="position-fixed bottom-0 right-0 p-3" style="z-index: 99999; right: 0; bottom: 0;">
            <div class="easy-imagemap-editor error-toast toast hide" role="alert" aria-live="assertive" aria-atomic="true" data-delay="2000" data-animation="true" data-autohide="false">
                <div class="toast-header">
                    <svg class="bd-placeholder-img rounded mr-2" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice" focusable="false">
                        <rect width="100%" height="100%" fill="#dc3545"></rect>
                    </svg>
                    <strong class="mr-auto"><?=RCView::tt("global_01") // ERROR ?></strong>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="<?=RCView::tt_attr("calendar_popup_01") // Close ?>">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="toast-body" data-content="toast"></div>
            </div>
        </div>
<?php
        #endregion

        #endregion
    }

    #endregion

    #region Private Helpers

    /**
     * Gets field and other metadata needed for the Online Designer integration
     * @param string $project_id 
     * @param string $field_name 
     * @return array 
     */
    private function easy_GetFieldInfo($project_id, $field_name) {
        $Proj = self::easy_GetProject($project_id);
        // Does the field exist?
        if (!isset($Proj->metadata[$field_name])) {
            throw new Exception("Field '$field_name' does not exist!");
        }
        $field = $Proj->metadata[$field_name];
        $form_name = $field["form_name"];
        $qualified_fields = $this->easy_GetQualifyingFields($project_id, $form_name);
        // Does it have the action tag?
        if (!array_key_exists($field_name, $qualified_fields)) {
            throw new Exception("Field '$field_name' is not marked with " . self::ACTIONTAG . "!");
        }
        // Extract action tag parameter. The parameter is a JSON string that must be wrapped in single quotes!
        $tag = array_pop(ActionTagHelper::parseActionTags($field["misc"], self::ACTIONTAG));
        $params = trim($tag["params"]);
        if ($params == "") $params = "{}";
        try {
            $params = json_decode($params, true, 512, JSON_THROW_ON_ERROR);
        }
        catch(\Throwable $_) {
            throw new Exception("Failed to parse action tag parameter (invalid JSON). Fix or remove/reset it manually!");
        }
        $assignables = array();
        foreach ($Proj->forms[$form_name]["fields"] as $this_field_name => $_) {
            if ($this_field_name == "{$form_name}_complete") continue; // Skip form status field
            $this_field = $Proj->metadata[$this_field_name];
            $this_type = $this_field["element_type"];
            $this_icon = $this_type == "checkbox" ? "<i class=\"far fa-check-square\"></i>" : "<i class=\"fas fa-dot-circle\"></i>";
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
    private function easy_GetQualifyingFields($project_id, $form) {
        $fields = [];
        $Proj = self::easy_GetProject($project_id);
        foreach ($Proj->forms[$form]["fields"] as $field_name => $_) {
            $field_meta = $Proj->metadata[$field_name];
            if (
                $field_meta["element_type"] == "descriptive" &&
                $field_meta["edoc_id"] &&
                $field_meta["edoc_display_img"] == "1" &&
                strpos($field_meta["misc"], self::ACTIONTAG) !== false
            ) {
                $fields[$field_name] = Files::docIdHash($field_meta["edoc_id"], $Proj->getProjectSalt($project_id));
            }
        }
        return $fields;
    }

    /**
     * Saves designer data in a field's Action Tag / Field Annotation ('misc')
     * @param string $project_id 
     * @param Array $data 
     * @return true 
     * @throws Exception Throws in case of failure
     */
    private function easy_SaveData($project_id, $data) {
        $Proj = self::easy_GetProject($project_id);
        $field_name = $data["fieldName"];
        $form_name = $data["formName"];
        $map = $data["map"];
        $qualified_fields = $this->easy_GetQualifyingFields($project_id, $form_name);
        if (!array_key_exists($field_name, $qualified_fields)) {
            throw new Exception("Invalid operation: Field '$field_name' is not on instrument '$form_name' or does not have the required action tag or properties.");
        }
        $field_data = $Proj->metadata[$field_name];
        $at = array_pop(ActionTagHelper::parseActionTags($field_data["misc"], self::ACTIONTAG));
        $search = $at["match"];
        $map["_w"] = $data["bounds"]["width"];
        $map["_h"] = $data["bounds"]["height"];
        $map["_two-way"] = $data["two-way"];
        $json = json_encode($map, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        $replace = $at["actiontag"]."=".$json;
        $misc = checkNull(trim(str_replace($search, $replace, $field_data["misc"])));
        $status = intval($Proj->project['status'] ?: 0);
        $metadata_table = ($status > 0) ? ProjectDesigner::METADATA_TEMP_TABLE : ProjectDesigner::METADATA_TABLE;
        $field_name = db_escape($field_name);
        // Update field
        $sql = "UPDATE `$metadata_table` SET `misc` = $misc WHERE `project_id` = $project_id AND `field_name` = '$field_name'";
        $q = db_query($sql);
        if (!$q) {
            throw new Exception("Failed to update the database with query: $sql. Error: ". db_error());
        }
        return true;
    }

    /**
     * Gets a (cached) instance of the Project class
     * @param string|int $project_id 
     * @return \Project
     */
    private static function easy_GetProject($project_id) {
        if (!isset(static::$PROJECT_CACHE[$project_id])) {
            static::$PROJECT_CACHE[$project_id] = new \Project($project_id);
        }
        return static::$PROJECT_CACHE[$project_id];
    }

    #endregion

}
