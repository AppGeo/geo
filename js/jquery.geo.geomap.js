﻿(function ($, undefined) {

  var 
  // public property name strings
  _bbox = "bbox",
  _bboxMax = "bboxMax",
  _center = "center",
  _cursors = "cursors",
  _mode = "mode",
  _services = "services",
  _tilingScheme = "tilingScheme",
  _zoom = "zoom",

  // private property name strings
  __serviceTypes = "_serviceTypes",

  // misc other strings (strings must be used more than once
  // before adding them to this list)
  _position = "position",
  _relative = "relative",
  _width = "width",
  _height = "height",

  // private widget members
  _elem,

  _contentBounds = {},

  _contentFrame,
  _servicesContainer,
  _graphicsContainer,
  _textContainer,
  _textContent,
  _eventTarget,

  _dpi = 96,

  _currentServices = [], //< internal copy

  _center,
  _pixelSize,
  _centerMax,
  _pixelSizeMax,

  _wheelZoomFactor = 1.18920711500273,
  _wheelTimer = null,
  _wheelLevel = 0,

  _zoomFactor = 2,

  _mouseDown,
  _inOp,
  _toolPan,
  _shiftZoom,
  _anchor,
  _current,
  _downDate,
  _moveDate,
  _clickDate,
  _lastMove,
  _lastDrag,

  _panning,
  _velocity,
  _friction,

  _ieVersion = (function () {
    var v = 5, div = document.createElement("div"), a = div.all || [];
    while (div.innerHTML = "<!--[if gt IE " + (++v) + "]><br><![endif]-->", a[0]) { }
    return v > 6 ? v : !v;
  } ()),

  _supportTouch,
  _softDblClick = this._supportTouch || this._ieVersion == 7,
  _isTap,
  _isDbltap,

  _initOptions = {},

  _options = {},

  _defaultOptions = {
    bbox: [-180, -85, 180, 85],
    bboxMax: [-180, -85, 180, 85],
    center: [0, 0],
    cursors: {
      pan: "move"
    },
    mode: "pan",
    services: [
        {
          id: "OSM",
          type: "tiled",
          getUrl: function (view) {
            return "http://tile.openstreetmap.org/" + view.zoom + "/" + view.tile.column + "/" + view.tile.row + ".png";
          },
          attr: "&copy; OpenStreetMap &amp; contributors, CC-BY-SA"
        }
      ],
    tilingScheme: {
      tileWidth: 256,
      tileHeight: 256,
      levels: 18,
      basePixelSize: 156543.03392799936,
      origin: [-20037508.342787, 20037508.342787]
    },
    zoom: 0,

    _serviceTypes: {
      tiled: (function () {
        var tiledServicesState = {};

        return {
          create: function (map, service, index) {
            if (tiledServicesState[service.id] == null) {
              tiledServicesState[service.id] = {
                loadCount: 0,
                reloadTiles: false,
                serviceContainer: null
              };

              var scHtml = "<div data-service='" + service.id + "' style='position:absolute; left:0; top:0; width:8px; height:8px; margin:0; padding:0; display:" + (service.visible === undefined || service.visible ? "block" : "none") + ";'></div>";
              _servicesContainer.append(scHtml);

              tiledServicesState[service.id].serviceContainer = _servicesContainer.children("[data-service='" + service.id + "']");
            }
          },

          destroy: function (map, service) {
            tiledServicesState[service.id].serviceContainer.remove();
            delete tiledServicesState[service.id];
          },

          interactivePan: function (map, service, dx, dy) {
            this._cancelUnloaded(map, service);
            tiledServicesState[service.id].serviceContainer.children().css({
              left: function (index, value) {
                return parseInt(value) + dx;
              },
              top: function (index, value) {
                return parseInt(value) + dy;
              }
            });
          },

          interactiveScale: function (map, service, center, pixelSize) {
          },

          refresh: function (map, service) {
            if (service != null && tiledServicesState[service.id] != null && (service.visible === undefined || service.visible)) {
              this._cancelUnloaded(map, service);

              var serviceState = tiledServicesState[service.id],

              serviceContainer = serviceState.serviceContainer,

              pixelSize = _pixelSize,
              mapWidth = _contentBounds[_width],
              mapHeight = _contentBounds[_height],
              bbox = map._getBbox(),

              tilingScheme = map.options[_tilingScheme],
              tileWidth = tilingScheme.tileWidth,
              tileHeight = tilingScheme.tileHeight,

              tileX = Math.floor((bbox[0] - tilingScheme.origin[0]) / (pixelSize * tileWidth)),
              tileY = Math.floor((tilingScheme.origin[1] - bbox[3]) / (pixelSize * tileHeight)),
              tileX2 = Math.ceil((bbox[2] - tilingScheme.origin[0]) / (pixelSize * tileWidth)),
              tileY2 = Math.ceil((tilingScheme.origin[1] - bbox[1]) / (pixelSize * tileHeight)),

              bboxMax = map._getBboxMax(),
              pixelSizeAtZero = map._getTiledPixelSize(0),
              ratio = pixelSizeAtZero / pixelSize,
              fullXAtScale = Math.floor((bboxMax[0] - tilingScheme.origin[0]) / (pixelSizeAtZero * tileWidth)) * ratio,
              fullYAtScale = Math.floor((tilingScheme.origin[1] - bboxMax[3]) / (pixelSizeAtZero * tileHeight)) * ratio,

              fullXMinX = tilingScheme.origin[0] + (fullXAtScale * tileWidth) * pixelSize,
              fullYMaxY = tilingScheme.origin[1] - (fullYAtScale * tileHeight) * pixelSize,

              serviceLeft = Math.round((fullXMinX - bbox[0]) / pixelSize),
              serviceTop = Math.round((bbox[3] - fullYMaxY) / pixelSize),

              scaleContainers = serviceContainer.children().show(),
              scaleContainer = scaleContainers.filter("[data-pixelSize='" + pixelSize + "']").appendTo(serviceContainer),

              opacity = (service.opacity === undefined ? 1 : service.opacity);

              if (serviceState.reloadTiles) {
                scaleContainers.find("img").attr("data-dirty", "true");
              }

              if (scaleContainer.size() === 0) {
                serviceContainer.append("<div style='position:absolute; left:" + serviceLeft % tileWidth + "px; top:" + serviceTop % tileHeight + "px; width:" + tileWidth + "px; height:" + tileHeight + "px; margin:0; padding:0;' data-pixelSize='" + pixelSize + "'></div>");
                scaleContainer = serviceContainer.children(":last").data("scaleOrigin", (serviceLeft % tileWidth) + "," + (serviceTop % tileHeight));
              } else {
                scaleContainer.css({
                  left: (serviceLeft % tileWidth) + "px",
                  top: (serviceTop % tileHeight) + "px"
                }).data("scaleOrigin", (serviceLeft % tileWidth) + "," + (serviceTop % tileHeight));

                scaleContainer.children().each(function (i) {
                  var $img = $(this);
                  var tile = $img.attr("data-tile").split(",");
                  $img.css({
                    left: Math.round(((parseInt(tile[0]) - fullXAtScale) * 100) + (serviceLeft - (serviceLeft % tileWidth)) / tileWidth * 100) + "%",
                    top: Math.round(((parseInt(tile[1]) - fullYAtScale) * 100) + (serviceTop - (serviceTop % tileHeight)) / tileHeight * 100) + "%"
                  });

                  if (opacity < 1) {
                    $img.fadeTo(0, opacity);
                  }
                });
              }

              for (var x = tileX; x < tileX2; x++) {
                for (var y = tileY; y < tileY2; y++) {
                  var 
                  tileStr = "" + x + "," + y,
                  $image = scaleContainer.children("[data-tile='" + tileStr + "']");

                  $image.removeAttr("data-dirty");

                  if ($image.size() === 0 || serviceState.reloadTiles) {
                    var bottomLeft = [
                      tilingScheme.origin[0] + (x * tileWidth) * pixelSize,
                      tilingScheme.origin[1] - (y * tileHeight) * pixelSize
                    ],

                    topRight = [
                      tilingScheme.origin[0] + ((x + 1) * tileWidth - 1) * pixelSize,
                      tilingScheme.origin[1] - ((y + 1) * tileHeight - 1) * pixelSize
                    ],

                    tileBbox = [bottomLeft[0], bottomLeft[1], topRight[0], topRight[1]],

                    imageUrl = service.getUrl({
                      bbox: tileBbox,
                      width: tileWidth,
                      height: tileHeight,
                      zoom: map._getZoom(),
                      tile: {
                        row: y,
                        column: x
                      },
                      index: Math.abs(y + x)
                    });

                    serviceState.loadCount++;

                    if (serviceState.reloadTiles && $image.size() > 0) {
                      $image.attr("src", imageUrl);
                    } else {
                      var imgMarkup = "<img style='position:absolute; " +
                      "left:" + (((x - fullXAtScale) * 100) + (serviceLeft - (serviceLeft % tileWidth)) / tileWidth * 100) + "%; " +
                      "top:" + (((y - fullYAtScale) * 100) + (serviceTop - (serviceTop % tileHeight)) / tileHeight * 100) + "%; ";

                      if ($("body")[0].filters === undefined) {
                        imgMarkup += "width: 100%; height: 100%;";
                      }

                      imgMarkup += "margin:0; padding:0; -moz-user-select:none; display:none;' unselectable='on' data-tile='" + tileStr + "' />";

                      scaleContainer.append(imgMarkup);
                      $image = scaleContainer.children(":last");
                      $image.load(function (e) {
                        if (opacity < 1) {
                          $(e.target).fadeTo(0, opacity);
                        } else {
                          $(e.target).show();
                        }

                        serviceState.loadCount--;

                        if (serviceState.loadCount <= 0) {
                          serviceContainer.children(":not([data-pixelSize='" + pixelSize + "'])").remove();
                          serviceState.loadCount = 0;
                        }
                      }).error(function (e) {
                        $(e.target).remove();
                        serviceState.loadCount--;

                        if (serviceState.loadCount <= 0) {
                          serviceContainer.children(":not([data-pixelSize='" + pixelSize + "'])").remove();
                          serviceState.loadCount = 0;
                        }
                      }).attr("src", imageUrl);
                    }
                  }
                }
              }

              scaleContainers.find("[data-dirty]").remove();
              serviceState.reloadTiles = false;
            }
          },

          _cancelUnloaded: function (map, service) {
            var serviceState = tiledServicesState[service.id],
            serviceContainer = serviceState.serviceContainer;

            if (serviceState.loadCount > 0) {
              serviceContainer.find("img:hidden").remove();
              while (serviceState.loadCount > 0) {
                serviceState.loadCount--;
              }
            }
          },

          _onOpacityChanged: function () {
          }
        };
      })()
    }
  };

  $.widget("geo.geomap", (function () {
    return {
      options: $.extend({}, _defaultOptions),

      _createWidget: function (options, element) {
        _initOptions = options;
        _elem = $(element);

        var cssPosition = _elem.css(_position),
          size;

        if (cssPosition != _relative && cssPosition != "absolute" && cssPosition != "fixed") {
          _elem.css(_position, _relative);
        }

        _elem.css("text-align", "left");

        size = this._findMapSize();
        _contentBounds = {
          x: parseInt(_elem.css("padding-left")),
          y: parseInt(_elem.css("padding-top")),
          width: size[_width],
          height: size[_height]
        };

        this._createChildren();

        _center = _centerMax = [0, 0];

        _pixelSize = _pixelSizeMax = 156543.03392799936;

        _mouseDown =
        _inOp =
        _toolPan =
        _shiftZoom =
        _panning =
        _isTap =
        _isDbltap = false;

        _anchor =
        _current =
        _lastMove =
        _lastDrag =
        _velocity = [0, 0];

        _friction = [.8, .8];

        _downDate =
        _moveDate =
        _clickDate = 0;

        $.Widget.prototype._createWidget.apply(this, arguments);
      },

      _create: function () {
        _options = this.options;

        _supportTouch = "ontouchend" in document;

        var touchStartEvent = _supportTouch ? "touchstart" : "mousedown",
    	  touchStopEvent = _supportTouch ? "touchend touchcancel" : "mouseup",
    	  touchMoveEvent = _supportTouch ? "touchmove" : "mousemove";

        _eventTarget.dblclick($.proxy(this._eventTarget_dblclick, this));
        _eventTarget.bind(touchStartEvent, $.proxy(this._eventTarget_touchstart, this));

        var dragTarget = (_eventTarget[0].setCapture) ? _eventTarget : $(document);
        dragTarget.bind(touchMoveEvent, $.proxy(this._dragTarget_touchmove, this));
        dragTarget.bind(touchStopEvent, $.proxy(this._dragTarget_touchstop, this));

        _eventTarget.mousewheel($.proxy(this._eventTarget_mousewheel, this));

        if (_initOptions) {
          if (_initOptions.bbox) {
            this._setOption("bbox", _initOptions.bbox, false);
          }
          if (_initOptions.center) {
            this._setOption("center", _initOptions.center, false);
          }
          if (_initOptions.zoom) {
            this._setZoom(_initOptions.zoom, false, false);
          }
        }

        _eventTarget.css("cursor", _options[_cursors][_options[_mode]]);

        this._createServices();

        this._refresh();
      },

      _setOption: function (key, value, refresh) {
        refresh = (refresh === undefined || refresh);

        switch (key) {
          case "bbox":
            if ($.geo.proj) {
              value = $.geo.proj.fromGeodetic([[value[0], value[1]], [value[2], value[3]]]);
              value = [value[0][0], value[0][1], value[1][0], value[1][1]];
            }

            this._setBbox(value, false, refresh);
            value = this._getBbox();

            if ($.geo.proj) {
              value = $.geo.proj.toGeodetic([[value[0], value[1]], [value[2], value[3]]]);
              value = [value[0][0], value[0][1], value[1][0], value[1][1]];
            }
            break;

          case "center":
            this._setCenterAndSize($.geo.proj ? $.geo.proj.fromGeodetic([[value[0], value[1]]])[0] : value, _pixelSize, false, refresh);
            break;

          case "zoom":
            this._setZoom(value, false, refresh);
            break;
        }

        $.Widget.prototype._setOption.apply(this, arguments);

        switch (key) {
          case "services":
            this._createServices();
            if (refresh) {
              this._refresh();
            }
            break;
        }
      },

      destroy: function () {
        $.Widget.prototype.destroy.apply(this, arguments);
        this.element.html("");
      },

      getPixelSize: function () {
        return _pixelSize;
      },

      _getBbox: function () {
        // calculate the internal bbox
        var halfWidth = _contentBounds[_width] / 2 * _pixelSize,
        halfHeight = _contentBounds[_height] / 2 * _pixelSize;
        return [_center[0] - halfWidth, _center[1] - halfHeight, _center[0] + halfWidth, _center[1] + halfHeight];
      },

      _setBbox: function (value, trigger, refresh) {
        var center = [value[0] + (value[2] - value[0]) / 2, value[1] + (value[3] - value[1]) / 2],
          pixelSize = Math.max($.geo._width(value) / _contentBounds.width, $.geo._height(value) / _contentBounds.height);

        if (_options[_tilingScheme]) {
          var zoom = this._getTiledZoom(pixelSize);
          pixelSize = this._getTiledPixelSize(zoom);
        }
        this._setCenterAndSize(center, pixelSize, trigger, refresh);
      },

      _getBboxMax: function () {
        // calculate the internal bboxMax
        var halfWidth = _contentBounds[_width] / 2 * _pixelSizeMax,
        halfHeight = _contentBounds[_height] / 2 * _pixelSizeMax;
        return [_centerMax[0] - halfWidth, _centerMax[1] - halfHeight, _centerMax[0] + halfWidth, _centerMax[1] + halfHeight];
      },

      _getZoom: function () {
        // calculate the internal zoom level, vs. public zoom property
        if (_options[_tilingScheme]) {
          return this._getTiledZoom(_pixelSize);
        } else {
          var ratio = _contentBounds[_width] / _contentBounds[_height],
          bbox = $.geo._reaspect(this._getBbox(), ratio),
          bboxMax = $.geo._reaspect(this._getBboxMax(), ratio);

          return Math.log($.geo._width(bboxMax) / $.geo._width(bbox)) / Math.log(_zoomFactor);
        }
      },

      _setZoom: function (value, trigger, refresh) {
        value = Math.max(value, 0);

        if (_options[_tilingScheme]) {
          this._setCenterAndSize(_center, this._getTiledPixelSize(value), trigger, refresh);
        } else {
          var 
          bbox = $.geo._scaleBy(this._getBbox(), 1 / Math.pow(_zoomFactor, value)),
          pixelSize = Math.max($.geo._width(bbox) / _contentBounds.width, $.geo._height(bbox) / _contentBounds.height);
          this._setCenterAndSize(_center, pixelSize, trigger, refresh);
        }
      },

      _createChildren: function () {
        var existingChildren = _elem.children().detach();

        existingChildren.css("-moz-user-select", "none");

        _elem.prepend("<div style='position:absolute; left:" + _contentBounds.x + "px; top:" + _contentBounds.y + "px; width:" + _contentBounds[_width] + "px; height:" + _contentBounds[_height] + "px; margin:0; padding:0; overflow:hidden; -khtml-user-select:none; -moz-user-select:none; -webkit-user-select:none; user-select:none;' unselectable='on'></div>");
        _eventTarget = _contentFrame = _elem.children(':first');

        _contentFrame.append('<div style="position:absolute; left:0; top:0; width:' + _contentBounds[_width] + 'px; height:' + _contentBounds[_height] + 'px; margin: 0; padding: 0;"></div>');
        _servicesContainer = _contentFrame.children(':last');

        _contentFrame.append('<div style="position:absolute; left:0; top:0; width:' + _contentBounds[_width] + 'px; height:' + _contentBounds[_height] + 'px; margin: 0; padding: 0;"></div>');
        _graphicsContainer = _contentFrame.children(':last');

        _contentFrame.append('<div class="ui-widget ui-widget-content ui-corner-all" style="position:absolute; left:0; top:0px; max-width:128px; display:none;"><div style="margin:.2em;"></div></div>');
        _textContainer = _contentFrame.children(':last');
        _textContent = _textContainer.children();

        _contentFrame.append(existingChildren);
      },

      _createServices: function () {
        var i;
        for (i = 0; i < _currentServices.length; i++) {
          _options[__serviceTypes][_currentServices[i].type].destroy(this, _currentServices[i]);
        }

        for (i = 0; i < _options[_services].length; i++) {
          _options[__serviceTypes][_options[_services][i].type].create(this, _options[_services][i], i);
        }

        _currentServices = _options[_services];
      },

      _findMapSize: function () {
        // really, really attempt to find a size for this thing
        // even if it's hidden (look at parents)
        var size = { width: 0, height: 0 },
        sizeContainer = _elem;

        while (sizeContainer.size() && !(size[_width] > 0 && size[_height] > 0)) {
          size = { width: sizeContainer.width(), height: sizeContainer.height() };
          if (size[_width] <= 0 || size[_height] <= 0) {
            size = { width: parseInt(sizeContainer.css(_width)), height: parseInt(sizeContainer.css(_height)) };
          }
          sizeContainer = sizeContainer.parent();
        }
        return size;
      },

      _getTiledPixelSize: function (zoom) {
        var tilingScheme = _options[_tilingScheme];
        if (tilingScheme != null) {
          if (zoom === 0) {
            return tilingScheme.pixelSizes != null ? tilingScheme.pixelSizes[0] : tilingScheme.basePixelSize;
          }

          zoom = Math.round(zoom);
          zoom = Math.max(zoom, 0);
          var levels = tilingScheme.pixelSizes != null ? tilingScheme.pixelSizes.length : tilingScheme.levels;
          zoom = Math.min(zoom, levels - 1);

          if (tilingScheme.pixelSizes != null) {
            return tilingScheme.pixelSizes[zoom];
          } else {
            return tilingScheme.basePixelSize / Math.pow(2, zoom);
          }
        } else {
          return NaN;
        }
      },

      _getTiledZoom: function (pixelSize) {
        var tilingScheme = _options[_tilingScheme];
        if (tilingScheme.pixelSizes != null) {
          var roundedPixelSize = Math.round(pixelSize),
          levels = tilingScheme.pixelSizes != null ? tilingScheme.pixelSizes.length : tilingScheme.levels;
          for (var i = levels - 1; i >= 0; i--) {
            if (Math.round(tilingScheme.pixelSizes[i]) >= roundedPixelSize) {
              return i;
            }
          }
          return 0;
        } else {
          return Math.max(Math.round(Math.log(tilingScheme.basePixelSize / pixelSize) / Math.log(2)), 0);
        }
      },

      _panEnd: function () {
        _velocity = [
        (_velocity[0] > 0 ? Math.floor(_velocity[0] * _friction[0]) : Math.ceil(_velocity[0] * _friction[0])),
        (_velocity[1] > 0 ? Math.floor(_velocity[1] * _friction[1]) : Math.ceil(_velocity[1] * _friction[1]))
      ];

        if (Math.abs(_velocity[0]) < 4 && Math.abs(_velocity[1]) < 4) {
          this._panFinalize();
        } else {
          _current = [
          _current[0] + _velocity[0],
          _current[1] + _velocity[1]
        ];

          this._panMove();
          setTimeout($.proxy(this._panEnd, this), 30);
        }
      },

      _panFinalize: function () {
        if (_panning) {
          _velocity = [0, 0];

          var 
          dx = _current[0] - _anchor[0],
          dy = _current[1] - _anchor[1],
          dxMap = -dx * _pixelSize,
          dyMap = dy * _pixelSize;

          //console.log('panFinalize: ' + dx + ', ' + dy);

          this._setCenterAndSize([_center[0] + dxMap, _center[1] + dyMap], _pixelSize, true, true);
          // trigger("geomapbbox")

          _inOp = false;
          _anchor = _current;
          _toolPan = _panning = false;

          _eventTarget.css("cursor", _options[_cursors][_options[_mode]]);
        }
      },

      _panMove: function () {
        var 
        dx = _current[0] - _lastDrag[0],
        dy = _current[1] - _lastDrag[1];

        if (_toolPan || dx > 3 || dx < -3 || dy > 3 || dy < -3) {
          if (!_toolPan) {
            _toolPan = true;
            _eventTarget.css("cursor", _options[_cursors]["pan"]);
          }

          if (_mouseDown) {
            _velocity = [dx, dy];
          }

          if (dx != 0 || dy != 0) {
            _panning = true;
            _lastDrag = _current;

            for (i = 0; i < _options[_services].length; i++) {
              var service = _options[_services][i];
              _options[__serviceTypes][service.type].interactivePan(this, service, dx, dy);
            }
          }
        }
      },

      _refresh: function () {
        for (var i = 0; i < _options[_services].length; i++) {
          var service = _options[_services][i];
          if (!_mouseDown && _options[__serviceTypes][service.type] != null) {
            _options[__serviceTypes][service.type].refresh(this, service);
          }
        }
      },

      _setCenterAndSize: function (center, pixelSize, trigger, refresh) {
        // the final call during any extent change
        if (_pixelSize != pixelSize) {
          for (var i = 0; i < _options[_services].length; i++) {
            var service = _options[_services][i];
            _options[__serviceTypes][service.type].interactiveScale(this, service, center, pixelSize);
          }
        }

        _center = center;
        _pixelSize = pixelSize;

        if ($.geo.proj) {
          var bbox = this._getBbox();
          bbox = $.geo.proj.toGeodetic([[bbox[0], bbox[1]], [bbox[2], bbox[3]]]);
          bbox = [bbox[0][0], bbox[0][1], bbox[1][0], bbox[1][1]];
          _options[_bbox] = bbox;

          _options[_center] = $.geo.proj.toGeodetic([[_center[0], _center[1]]])[0];
        } else {
          _options[_bbox] = this._getBbox();

          _options[_center] = _center;
        }

        _options[_zoom] = this._getZoom();

        if (refresh) {
          this._refresh();
        }
      },

      _toMap: function (p, center, pixelSize) {
        // ignores $.geo.proj
        var isArray = $.isArray(p[0]);
        if (!isArray) {
          p = [p];
        }

        center = center || _center;
        pixelSize = pixelSize || _pixelSize;

        var width = _contentBounds[_width],
        height = _contentBounds[_height],
        halfWidth = width / 2 * pixelSize,
        halfHeight = height / 2 * pixelSize,
        bbox = [center[0] - halfWidth, center[1] - halfHeight, center[0] + halfWidth, center[1] + halfHeight],
        xRatio = $.geo._width(bbox) / width,
        yRatio = $.geo._height(bbox) / height,
        result = [];

        $.each(p, function (i) {
          var yOffset = (this[1] * yRatio);
          result[i] = [bbox[0] + (this[0] * xRatio), bbox[3] - yOffset];
        });

        if (isArray) {
          return result;
        } else {
          return result[0];
        }
      },

      _zoomTo: function (coord, zoom) {
        zoom = zoom < 0 ? 0 : zoom;

        var tiledPixelSize = this._getTiledPixelSize(zoom);

        if (!isNaN(tiledPixelSize)) {
          this._setCenterAndSize(coord, tiledPixelSize, false, true);
        } else {
          var bboxMax = $.geo._scaleBy(this._getBboxMax(), 1 / Math.pow(_zoomFactor, zoom)),
          pixelSize = Math.max($.geo._width(bboxMax) / _contentBounds[_width], $.geo._height(bboxMax) / _contentBounds[_height]);
          this._setCenterAndSize(coord, pixelSize, false, true);
        }
      },

      _eventTarget_dblclick: function (e) {
        this._panFinalize();

        offset = $(e.currentTarget).offset();

        switch (_options[_mode]) {
          case "pan":
            this._zoomTo(this._toMap(_current), this._getZoom() + 1);
            break;
        }

        _inOp = false;
      },

      _eventTarget_touchstart: function (e) {
        if (!_supportTouch && e.which != 1) {
          return;
        }

        if (_softDblClick) {
          var downDate = $.now();
          if (downDate - _downDate < 750) {
            if (_isDbltap) {
              _isDbltap = false;
            } else {
              _isDbltap = _isTap;
            }
          } else {
            _isDbltap = false;
          }
          _isTap = true;
          _downDate = downDate;
        }

        e.preventDefault();

        this._panFinalize();
        //this._mouseWheelFinish();

        var offset = $(e.currentTarget).offset();

        if (_supportTouch) {
          _current = [e.originalEvent.changedTouches[0].pageX - offset.left, e.originalEvent.changedTouches[0].pageY - offset.top];
        } else {
          _current = [e.pageX - offset.left, e.pageY - offset.top];
        }

        _mouseDown = true;
        _anchor = _current;

        if (!_inOp && e.shiftKey) {
          _shiftZoom = true;
          _eventTarget.css("cursor", _options[_cursors]["zoom"]);
        } else {
          _inOp = true;
          switch (_options[_mode]) {
            case "pan":
              _lastDrag = _current;

              if (e.currentTarget.setCapture) {
                e.currentTarget.setCapture();
              }
              break;
          }
        }

        return false;
      },

      _dragTarget_touchmove: function (e) {
        var 
        offset = _eventTarget.offset(),
        current, i, dx, dy;

        if (_supportTouch) {
          current = [e.originalEvent.changedTouches[0].pageX - offset.left, e.originalEvent.changedTouches[0].pageY - offset.top];
        } else {
          current = [e.pageX - offset.left, e.pageY - offset.top];
        }

        if (current[0] == _lastMove[0] && current[1] == _lastMove[1]) {
          return;
        }

        if (_softDblClick) {
          _isDbltap = _isTap = false;
        }

        if (_mouseDown) {
          _current = current;
          _moveDate = $.now();
        }

        var mode = _shiftZoom ? "zoom" : _options[_mode];

        switch (mode) {
          case "pan":
            if (_mouseDown) {
              this._panMove();
            } else {
              // trigger geomapmove
            }
            break;
        }

        _lastMove = current;
      },

      _dragTarget_touchstop: function (e) {
        if (!_mouseDown && _ieVersion == 7) {
          // ie7 doesn't appear to trigger dblclick on _eventTarget,
          // we fake regular click here to cause soft dblclick
          this._eventTarget_touchstart(e);
        }

        var 
        mouseWasDown = _mouseDown,
        wasToolPan = _toolPan,
        offset = _eventTarget.offset(),
        current, i;

        if (_supportTouch) {
          current = [e.originalEvent.changedTouches[0].pageX - offset.left, e.originalEvent.changedTouches[0].pageY - offset.top];
        } else {
          current = [e.pageX - offset.left, e.pageY - offset.top];
        }

        var mode = _shiftZoom ? "zoom" : _options[_mode];

        _eventTarget.css("cursor", _options[_cursors][mode]);

        _shiftZoom =
        _mouseDown =
        _toolPan = false;

        if (document.releaseCapture) {
          document.releaseCapture();
        }

        if (mouseWasDown) {
          var 
          clickDate = $.now(),
          dx, dy;

          _current = current;

          switch (mode) {
            case "pan":
              if (clickDate - _moveDate > 500) {
                this._panFinalize();
              } else {
                this._panEnd();
              }
              break;
          }

          _clickDate = clickDate;

          if (_softDblClick && _isDbltap) {
            _isDbltap = _isTap = false;
            _eventTarget.trigger("dblclick", e);
          }
        }
      },

      _eventTarget_mousewheel: function (e, delta) {

      }
    };
  })()
  );


})(jQuery);

