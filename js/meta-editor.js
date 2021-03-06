define([
    'underscore',
    'jquery',
    'exif',
    'drp-app-api'
], function(_, $, Exif, appApi) {

    var MetaEditor = function() {
        this.initialize();
    };

    _.extend(MetaEditor.prototype, {
        MAX_IMAGE_WIDTH:  1464,
        MAX_IMAGE_HEIGHT: 1104,

        initialize: function() {
            _.bindAll(this);

            this.editorPane = $('.meta-editor');
            this.tabCtrl    = $('.tab-controller');
            this.exifPane   = $('.exif-pane');
            this.inputPane  = $('.input-pane');
            this.imageBox   = this.editorPane.find('.image-container');
            this.imageView  = this.imageBox.find('.source');

            this.events = $({});
            this.bindEvents();
        },

        bindEvents: function() {
            $(window)
                .on('resize', _.debounce(this.resizePanes, 150))
                .trigger('resize');

            this.editorPane
                .find('.close')
                .on('click', this.hide);

            this.editorPane
                .find('.save')
                .on('click', this.saveMetadata);

            this.tabCtrl
                .find('button')
                .on('click', this.switchTab);
        },

        setTranslator: function(translator) {
            this.translator = translator;
        },

        setImboClient: function(imboClient) {
            this.imbo = imboClient;
        },

        resizePanes: function() {
            this.imageBox.css('height', $(window).height() - 50);
        },

        switchTab: function(e) {
            var el    = $(e.currentTarget),
                tab   = el.data('tab'),
                tabEl = this.editorPane.find('.tab[data-tab="' + tab + '"]');

            tabEl.removeClass('hidden')
                 .siblings('.tab')
                 .addClass('hidden');

            el
                .closest('.tab-controller')
                .find('button[data-tab]')
                .removeClass('active');

            el.addClass('active');
        },

        show: function() {
            // Maximize app window (if in app context)
            appApi.Article.maximizeAppWindow(
                this.translator.translate('META_EDITOR_TITLE'),
                this.hide
            );

            // Focus the first tab
            this.tabCtrl
                .find('button[data-tab]:first')
                .trigger('click');

            // Show the editor pane and trigger a show-event
            this.editorPane.removeClass('hidden');
            this.trigger('show');
        },

        hide: function() {
            this.imageIdentifier = null;

            this.editorPane.addClass('hidden');
            this.trigger('hide');

            appApi.Article.restoreAppWindow();

            appApi.hideLoader();
        },

        resetState: function() {
            this.inputPane.find('input, textarea').val('');
            this.imageView.css('background-image', '');
            this.tabCtrl.find('button[data-tab]').removeClass('hidden');
        },

        loadDataForImage: function(imageId) {
            // Reset state so we're not showing old data
            this.resetState();

            // Ensure app knows which image to change metadata on
            this.imageIdentifier = imageId;

            // Start loading image
            this.setImageViewUrl(
                this.imbo.getImageUrl(imageId).maxSize({
                    width: this.MAX_IMAGE_WIDTH,
                    height: this.MAX_IMAGE_HEIGHT
                }).jpg()
            );

            // Show a loading indicator while loading metadata
            appApi.showLoader(
                this.translator.translate('META_EDITOR_LOADING_METADATA')
            );

            // Fetch metadata for image
            this.imbo.getMetadata(imageId, this.onImageDataLoaded);
        },

        setImageViewUrl: function(url) {
            this.imageView.css(
                'background-image',
                'url(' + url.toString() + ')'
            );
        },

        onImageDataLoaded: function(err, data) {
            this.inputPane.find('input, textarea').each(function(i, el) {
                var name = el.getAttribute('name');
                if (data[name]) {
                    el.value = data[name];
                } else if (name === 'drp:title' && data['drp:filename']) {
                    el.value = data['drp:filename'];
                } else if (name === 'drp:photographer' && data['exif:Artist']) {
                    el.value = data['exif:Artist'];
                }
            });

            this.populateExifData(data);

            appApi.hideLoader();
        },

        populateExifData: function(data) {
            this.exifPane.empty();

            var dl = $('<dl />'), table, value, parts, tags = 0;
            for (var exifTag in Exif.TagMap) {
                if (!data[exifTag]) {
                    continue;
                }

                table = Exif.TagTable[exifTag];
                value = data[exifTag];

                // GPS location?
                if (exifTag === 'gps:location') {
                    value = ($('<a />')
                        .attr('target', '_blank')
                        .attr('href', 'http://maps.google.com/?q=' + value.reverse().join(','))
                        .text(value.reverse().map(function(i) { return i.toFixed(5); }).join(', ')));
                } else {
                    value = (value + '').replace(/^\s+|\s+$/g, '');
                }

                // Should we cast to integer?
                if (!isNaN(value)) {
                    value = parseInt(data[exifTag], 10);
                }

                // Do we have a lookup table with our value in it?
                if (table && table[value]) {
                    value = this.translator.translate(table[value]);
                }

                // Is the value dividable, to get a decimal variant?
                if (typeof value === 'string' && value.match(/^\d+\/\d+$/)) {
                    parts = value.split('/');
                    value = (parts[0] / parts[1]) + ' (' + value + ')';
                }

                // GPS altitude? Add suffix (unit)
                if (exifTag === 'gps:altitude') {
                    value += 'm';
                }

                $('<dt />')
                    .text(this.translator.translate(Exif.TagMap[exifTag]))
                    .appendTo(dl);

                $('<dd />')
                    .html(value)
                    .appendTo(dl);

                tags++;
            }

            if (tags > 0) {
                this.exifPane.append(dl);
            } else {
                this.tabCtrl
                    .find('[data-tab="exif"]')
                    .addClass('hidden');
            }
        },

        getMetadataFromInputs: function() {
            return _.reduce(
                this.inputPane.find('input, textarea'),
                function(data, el) {
                    data[el.getAttribute('name')] = el.value;
                    return data;
                }, {}
            );
        },

        saveMetadata: function() {
            if (!this.imageIdentifier) {
                return console.error('Tried to save metadata, no image active');
            }

            appApi.showLoader(
                this.translator.translate('META_EDITOR_SAVING_METADATA')
            );

            this.imbo.editMetadata(
                this.imageIdentifier,
                this.getMetadataFromInputs(),
                this.hide
            );
        },

        on: function(e, handler) {
            this.events.on(e, handler);
            return this;
        },

        off: function(e, handler) {
            this.events.off(e, handler);
            return this;
        },

        trigger: function(e, handler) {
            this.events.trigger(e, handler);
            return this;
        }
    });

    return MetaEditor;

});
