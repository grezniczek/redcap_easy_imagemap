// Easy Imagemap EM - Data Dictionary Codebook controls
;(function() {

const EIM = window.DE_RUB_EasyImagemap ?? {};
window.DE_RUB_EasyImagemap = EIM;
EIM.initCodebook = initialize;

function initialize(config, module) {
    $(function() {
        const $fieldFinderRow = $('#field-search').closest('tr');
        if (!$fieldFinderRow.length) return;

        const $hideFullConfigs = $('<input>', {
            id: 'eim-codebook-hide-full-configs',
            type: 'checkbox',
            class: 'form-check-input ms-2',
        }).prop('checked', config.hideFullConfigs === true);
        const $showDetails = $('<input>', {
            id: 'eim-codebook-show-details',
            type: 'checkbox',
            class: 'form-check-input ms-2',
        }).prop('checked', config.showDetails === true);
        const $detailsControl = $('<span class="eim-codebook-details-control"></span>')
            .toggle(config.hideFullConfigs === true)
            .append($showDetails)
            .append($('<label>', {
                for: 'eim-codebook-show-details',
                text: tt(config, 'codebook_show_details', 'Show configuration JSON at end of Codebook'),
            }));
        const $controls = $('<span class="eim-codebook-preferences d-print-none"></span>')
            .append($('<strong>').text(config.moduleName + ':'))
            .append($hideFullConfigs)
            .append($('<label>', {
                for: 'eim-codebook-hide-full-configs',
                text: tt(config, 'codebook_hide_full_configs', 'Hide full configuration JSON'),
            }))
            .append($detailsControl);

        $('<tr class="d-print-none"></tr>')
            .append($('<td colspan="3" class="pt-1 pb-0"></td>').append($controls))
            .insertAfter($fieldFinderRow);

        $hideFullConfigs.on('change', function() {
            const hideFullConfigs = $hideFullConfigs.prop('checked');
            if (!hideFullConfigs) {
                $showDetails.prop('checked', false);
            }
            $detailsControl.toggle(hideFullConfigs);
            savePreferences(module, hideFullConfigs, $showDetails.prop('checked'));
        });
        $showDetails.on('change', function() {
            savePreferences(module, $hideFullConfigs.prop('checked'), $showDetails.prop('checked'));
        });

        appendDetails(config);
    });
}

function savePreferences(module, hideFullConfigs, showDetails) {
    module.ajax('save-codebook-preferences', {
        hideFullConfigs: hideFullConfigs === true,
        showDetails: showDetails === true,
    }).then(function() {
        window.location.reload();
    }).catch(function(error) {
        console.error('Easy Imagemap: failed to save Codebook preferences.', error);
        window.alert('Easy Imagemap: failed to save Codebook preferences.');
    });
}

function appendDetails(config) {
    if (!config.showDetails || !Array.isArray(config.details) || !config.details.length) return;

    const $details = $('<section>', {
        id: 'eim-codebook-config-details',
        class: 'eim-codebook-config-details',
    }).append($('<h3>').text(tt(config, 'codebook_details_heading', 'Easy Imagemap configurations')));
    for (const detail of config.details) {
        const $fieldName = $('<code>').text(detail.fieldName);
        const $heading = $('<h4>')
            .append(document.createTextNode(tt(config, 'codebook_details_field', 'Field') + ': '))
            .append($fieldName);
        $details.append($heading).append($('<pre>').text(detail.json));
    }
    $('#codebook-table').after($details);
}

function tt(config, key, fallback) {
    return config.lang && config.lang[key] ? config.lang[key] : fallback;
}

})();
