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