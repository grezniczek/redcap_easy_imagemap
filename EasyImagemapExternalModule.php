<?php namespace DE\RUB\EasyImagemapExternalModule;

class EasyImagemapExternalModule extends \ExternalModules\AbstractExternalModule {

    private $js_debug = false;

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

    }

    #endregion


    #region Setup and Rendering 



    #endregion


}