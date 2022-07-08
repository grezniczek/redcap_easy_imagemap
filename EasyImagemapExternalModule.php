<?php namespace DE\RUB\EasyImagemapExternalModule;

class EasyImagemapExternalModule extends \ExternalModules\AbstractExternalModule {

    private $js_debug = false;
    static $PROJECT_CACHE = Array();
    const ACTIONTAG = "@EASYIMAGEMAP";

    function __construct() {
        parent::__construct();

        // Load settings
        if ($this->getProjectId() !== null) {
            $this->js_debug = $this->getProjectSetting("javascript-debug") == true;
        }
    }

    #region Hooks

    function redcap_data_entry_form ($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $repeat_instance = 1) {

    }

    function redcap_survey_page ($project_id, $record = NULL, $instrument, $event_id, $group_id = NULL, $survey_hash, $response_id = NULL, $repeat_instance = 1) {

    }

    function redcap_every_page_top ($project_id = null) {

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

    #endregion


    #region Online Designer Integration

    private function easy_OnlineDesigner($project_id, $form) {
        
        $config = [
            "debug" => $this->js_debug,
            "mode" => "OnlineDesigner",
            "version" => $this->VERSION,
            "fields" => $this->easy_GetQualifyingFields($project_id, $form),
        ]
        ?>
            <script src="<?php print $this->getUrl('js/EasyImagemap-OnlineDesigner.js'); ?>"></script>
            <script>
                $(function() {
                    DE_RUB_EasyImagemap.init(<?=json_encode($config)?>);
                });
            </script>
        <?php
        #region Editor Modal
        ?>
        <div class="modal easy-imagemap-editor" tabindex="-1" role="dialog" aria-labelledby="easy-imagemap-editor-title" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h1 id="easy-imagemap-editor-title">
                            Easy Imagemap Editor
                        </h1>
                    </div>
                    <div class="modal-body">
                        Body
                    </div>
                    <div class="modal-footer">
                        <button action="cancel" type="button" class="btn btn-secondary btn-sm"><?=\RCView::tt("global_53") // Cancel ?></button>
                        <button action="apply" type="button" class="btn btn-success btn-sm"><i class="fas fa-save"></i> &nbsp; <?=\RCView::tt("report_builder_28") // Save Changes ?></button>
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
                    <svg class="bd-placeholder-img rounded mr-2" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="100%" height="100%" fill="#28a745"></rect></svg>
                    <strong class="mr-auto"><?=\RCView::tt("multilang_100") // Success ?></strong>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="<?=\RCView::tt_attr("calendar_popup_01") // Close ?>">
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
                    <svg class="bd-placeholder-img rounded mr-2" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice" focusable="false"><rect width="100%" height="100%" fill="#dc3545"></rect></svg>
                    <strong class="mr-auto"><?=\RCView::tt("global_01") // ERROR ?></strong>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="<?=\RCView::tt_attr("calendar_popup_01") // Close ?>">
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

    private function easy_GetQualifyingFields($project_id, $form) {
        $fields = [];
        $Proj = self::easy_GetProject($project_id);
        foreach ($Proj->forms[$form]["fields"] as $field_name => $_) {
            $field_meta = $Proj->metadata[$field_name];
            if ($field_meta["element_type"] == "descriptive" && 
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