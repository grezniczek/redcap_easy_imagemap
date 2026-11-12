<?php

namespace ExternalModules {
    // The metadata selectors can be tested without bootstrapping REDCap or its database.
    class AbstractExternalModule
    {
        public $framework;

        public function tt($key)
        {
            return $key . ': %s';
        }
    }
}

namespace DE\RUB\EasyImagemapExternalModule {
    require_once __DIR__ . '/../EasyImagemapExternalModule.php';

    function assert_same($expected, $actual, $message)
    {
        if ($expected !== $actual) {
            throw new \RuntimeException($message);
        }
    }

    function invoke_private($module, $method, ...$args)
    {
        return (new \ReflectionMethod($module, $method))->invoke($module, ...$args);
    }

    // Model Project's preview-aware accessors, independently of Designer draft mode.
    $project = new class {
        public $project = ['status' => 1, 'draft_mode' => 1];
        public $forms = ['published' => ['fields' => ['published_field' => 'Published']]];
        public $forms_temp = ['draft_only' => ['fields' => ['draft_field' => 'Draft']]];
        public $metadata = ['published_field' => ['element_type' => 'text']];
        public $metadata_temp = ['draft_field' => ['element_type' => 'text']];

        public function getForms()
        {
            return ($GLOBALS['draft_preview_enabled'] ?? false) ? $this->forms_temp : $this->forms;
        }

        public function getMetadata()
        {
            return ($GLOBALS['draft_preview_enabled'] ?? false) ? $this->metadata_temp : $this->metadata;
        }

        public function getMetadataTable()
        {
            return ($GLOBALS['draft_preview_enabled'] ?? false) ? 'redcap_metadata_temp' : 'redcap_metadata';
        }
    };

    $module = new EasyImagemapExternalModule();
    (new \ReflectionProperty($module, 'proj'))->setValue($module, $project);
    $module->framework = new class {
        public function getUser($user_id)
        {
            return new class {
                public function hasDesignRights($project_id)
                {
                    return true;
                }
            };
        }
    };

    // Regression: Designer AJAX must find both a newly drafted form and its fields
    // without enabling draft preview. This threw error_form_missing before the fix.
    $GLOBALS['draft_preview_enabled'] = false;
    assert_same([], $module->redcap_module_ajax(
        'get-fields', 'draft_only', 1, null, null, null, null,
        null, null, null, 'Design/online_designer.php', null, 'designer', null
    ), 'Designer AJAX must resolve draft-only forms and metadata without preview.');
    assert_same('redcap_metadata_temp', invoke_private($module, 'get_project_metadata_table'),
        'Designer saves must target the draft table without preview.');

    $scenarios = [
        // label, status, draft mode, designer context, preview, expected draft source
        ['Development designer', 0, 0, true, false, false],
        ['Production designer without draft', 1, 0, true, false, false],
        ['Production designer with draft', 1, 1, true, false, true],
        ['Production designer with submitted draft', 1, 2, true, false, true],
        ['Production designer with draft preview', 1, 1, true, true, true],
        ['Published data entry/survey while drafting', 1, 1, false, false, false],
        ['Draft-preview data entry/survey', 1, 1, false, true, true],
        ['Production data entry/survey without draft', 1, 0, false, false, false],
    ];
    foreach ($scenarios as [$label, $status, $draft_mode, $designer, $preview, $expect_draft]) {
        $project->project = ['status' => $status, 'draft_mode' => $draft_mode];
        $GLOBALS['draft_preview_enabled'] = $preview;
        (new \ReflectionProperty($module, 'designer_context'))->setValue($module, $designer);
        $form = $expect_draft ? 'draft_only' : 'published';
        $field = $expect_draft ? 'draft_field' : 'published_field';
        assert_same([$field], invoke_private($module, 'get_form_fields', $form), "$label: form fields.");
        assert_same(['element_type' => 'text'], invoke_private($module, 'get_field_metadata', $field), "$label: field metadata.");
        assert_same($expect_draft ? 'redcap_metadata_temp' : 'redcap_metadata',
            invoke_private($module, 'get_project_metadata_table'), "$label: save table.");
    }

    // A normal production request need not define the draft-preview global.
    unset($GLOBALS['draft_preview_enabled']);
    $project->project = ['status' => 1, 'draft_mode' => 1];
    assert_same(['published_field'], invoke_private($module, 'get_form_fields', 'published'),
        'An absent preview flag must use published metadata outside the designer.');

    fwrite(STDOUT, "Draft metadata smoke tests passed.\n");
}
