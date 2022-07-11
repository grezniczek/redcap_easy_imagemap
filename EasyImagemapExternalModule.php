<?php namespace DE\RUB\EasyImagemapExternalModule;

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

    function redcap_data_entry_form($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $repeat_instance = 1)
    {
    }

    function redcap_survey_page($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $survey_hash, $response_id = NULL, $repeat_instance = 1)
    {
    }

    function redcap_every_page_top($project_id = null)
    {

        if ($project_id == null) return; // Skip non-project context

        $page = defined("PAGE") ? PAGE : "";

        // Online Designer
        if (strpos($page, "Design/online_designer.php") === 0) {
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
            
            case "edit-field":
                return $this->easy_GetFieldInfo($project_id, $payload);

            default:
                return null;
        }
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
            .easy-imagemap-editor .modal-body {
                padding: 0.5rem 1rem;
            }
            .easy-imagemap-editor p {
                margin-top: 0;
            }
            .easy-imagemap-editor .area-style-sample {
                display: inline-block;
                width: 4rem;
                height: 1.3rem;
                background-color: blue;
                position: absolute;
                margin-left: 10px;
            }
            .easy-imagemap-editor .field-name {
                font-weight: bold;
            }
        </style>
        <div class="easy-imagemap-editor modal fade" tabindex="-1" role="dialog" aria-labelledby="easy-imagemap-editor-title" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h4 id="easy-imagemap-editor-title">
                            Easy Imagemap Editor: <span class="field-name"></span>
                        </h4>
                    </div>
                    <div class="modal-body draw empty-on-close" style="position:relative;">
                        <!-- Image -->
                    </div>
                    <div class="modal-body buttons">
                        <p>
                            Add or edit areas, then assign them to checkbox or radio field options.
                        </p>
                        <button data-action="add-area" class="btn btn-success btn-xs"><i class="fas fa-plus"></i> Add new area</button>
                        <button data-action="clear-areas" class="btn btn-danger btn-xs"><i class="far fa-trash-alt"></i> Reset (remove all areas)</button>
                        |
                        <button data-action="style-areas" class="btn btn-defaultrc btn-xs"><i class="fas fa-palette"></i> Style selected areas</button>

                    </div>
                    <div class="modal-body assign">
                        <table class="table table-hover table-sm">
                            <thead>
                                <tr>
                                    <th scope="col"><i class="fas fa-pen-nib"></i> Edit</th>
                                    <th scope="col"><a data-action="toggle-select-all" href="javascript:;">Select</a></th>
                                    <th scope="col">Assignment</th>
                                    <th scope="col"><i class="fas fa-palette"></i> Style</th>
                                    <th scope="col">Action</th>
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
                                        <div class="form-inline">
                                            <select data-action="assign-target" class="assignables">
                                                <!-- Assignable field options -->
                                            </select>
                                        </div>
                                    </td>
                                    <td>
                                        <button data-action="style-area" class="btn btn-defaultrc btn-xs"><i class="fas fa-palette"></i> Style area</button>
                                        <div data-action="none" class="area-style-sample"></div>
                                    </td>
                                    <td>
                                        <button data-action="remove-area" class="btn btn-danger btn-xs"><i class="fas fa-close"></i> Remove</button>
                                    </td>
                                </tr>
                            </template>
                        </table>
                        <p class="show-when-no-areas"><i>No areas have been defined yet.</i></p>
                    </div>
                    <div class="modal-footer">
                        <button data-action="cancel" type="button" class="btn btn-secondary btn-sm"><?= \RCView::tt("global_53") // Cancel 
                                                                                                    ?></button>
                        <button data-action="apply" type="button" class="btn btn-success btn-sm"><i class="fas fa-save"></i> &nbsp; <?= \RCView::tt("report_builder_28") // Save Changes 
                                                                                                                                    ?></button>
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
                    <strong class="mr-auto"><?= \RCView::tt("multilang_100") // Success 
                                            ?></strong>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="<?= \RCView::tt_attr("calendar_popup_01") // Close 
                                                                                                    ?>">
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
                    <strong class="mr-auto"><?= \RCView::tt("global_01") // ERROR 
                                            ?></strong>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="<?= \RCView::tt_attr("calendar_popup_01") // Close 
                                                                                                    ?>">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="toast-body" data-content="toast"></div>
            </div>
        </div>
<?php
        #endregion

    }




    #endregion

    private function easy_GetFieldInfo($project_id, $field_name) {
        $Proj = self::easy_GetProject($project_id);
        // Does the field exist?
        if (!isset($Proj->metadata[$field_name])) {
            throw "Field '$field_name' does not exist!";
        }
        $field = $Proj->metadata[$field_name];
        $form_name = $field["form_name"];
        // Does it have the action tag?
        if (!in_array($field_name, $this->easy_GetQualifyingFields($project_id, $form_name), true)) {
            throw "Field '$field_name' is not marked with " . self::ACTIONTAG . "!";
        }
        // Extract action tag parameter. The parameter is a JSON string that must be wrapped in single quotes!
        $tag = array_pop(ActionTagHelper::parseActionTags($field["misc"], self::ACTIONTAG));
        $params = trim($tag["params"]);
        if ($params == "") $params = "{}";
        try {
            $params = json_decode($params, true, 512, JSON_THROW_ON_ERROR);
        }
        catch(\Throwable $_) {
            throw "Failed to parse action tag parameter (invalid JSON). Fix or remove/reset it manually!";
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
                            "label" => "- (empty/reset)",
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
        $data = [
            "fieldName" => $field_name,
            "formName" => $form_name,
            "map" => empty($params) ? null : $params,
            "assignables" => $assignables,
        ];

        return $data;
    }

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
                $fields[] = $field_name;
            }
        }
        return $fields;
    }


    private static function easy_GetProject($project_id) {
        if (!isset(static::$PROJECT_CACHE[$project_id])) {
            static::$PROJECT_CACHE[$project_id] = new \Project($project_id);
        }
        return static::$PROJECT_CACHE[$project_id];
    }
}
