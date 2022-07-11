<?php

namespace DE\RUB\EasyImagemapExternalModule;

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
        if ($action == "get-fields") {
            return $this->easy_GetQualifyingFields($project_id, $payload);
        }
        return null;
    }

    #endregion


    #region Online Designer Integration

    private function easy_OnlineDesigner($project_id, $form)
    {

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
                    <div class="modal-body assign empty-on-close">
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
                            <tbody>
                            </tbody>
                            <template class="row-template">
                                <tr data-action="edit-row">
                                    <td>
                                        <div class="form-check form-check-inline">
                                            <input class="form-check-input ml-2" type="radio" name="edit-area" value="">
                                        </div>
                                    </td>
                                    <td>
                                        <div data-action="select-row" class="form-check form-check-inline">
                                            <input class="form-check-input ml-2" type="checkbox" value="">
                                        </div>
                                    </td>
                                    <td>
                                        <div data-action="assign-target" class="form-inline">
                                            <select>
                                                <option selected>Choose...</option>
                                                <option value="1">One</option>
                                                <option value="2">Two</option>
                                                <option value="3">Three</option>
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

    private function easy_GetQualifyingFields($project_id, $form)
    {
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


    private static function easy_GetProject($project_id)
    {
        if (!isset(static::$PROJECT_CACHE[$project_id])) {
            static::$PROJECT_CACHE[$project_id] = new \Project($project_id);
        }
        return static::$PROJECT_CACHE[$project_id];
    }
}
