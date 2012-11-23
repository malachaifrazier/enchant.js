/**
 * @scope enchant.CanvasGroup.prototype
 */
enchant.CanvasLayer = enchant.Class.create(enchant.Group, {
    /**
     * @class
     [lang:ja]
     * Canvas を用いた描画を行うクラス。
     * 子を Canvas を用いた描画に切り替えるクラス
     [/lang]
     [lang:en]
     * A class which is using HTML Canvas for the rendering.
     * The rendering of children will be replaced by the Canvas rendering.
     [/lang]
     [lang:de]
     * Eine Klasse die HTML Canvas für das Rendern nutzt.
     * Das Rendern der Kinder wird durch das Canvas Rendering ersetzt.
     [/lang]
     * @constructs
     */
    initialize: function() {
        var game = enchant.Game.instance;

        enchant.Group.call(this);

        this._cvsCache = {
            matrix: [1, 0, 0, 1, 0, 0],
            detectColor: '#000000'
        };
        this._cvsCache.layer = this;

        this.width = game.width;
        this.height = game.height;

        this._element = document.createElement('canvas');
        this._element.width = game.width;
        this._element.height = game.height;
        this._element.style.position = 'absolute';

        this._detect = document.createElement('canvas');
        this._detect.width = game.width;
        this._detect.height = game.height;
        this._detect.style.position = 'absolute';
        this._lastDetected = 0;

        this.context = this._element.getContext('2d');
        this._dctx = this._detect.getContext('2d');

        this._colorManager = new enchant.DetectColorManager(16, 256);

        var touch = [
            enchant.Event.TOUCH_START,
            enchant.Event.TOUCH_MOVE,
            enchant.Event.TOUCH_END
        ];

        touch.forEach(function(type) {
            this.addEventListener(type, function(e) {
                if (this.scene) {
                    this.scene.dispatchEvent(e);
                }
            });
        }, this);

        var __onchildadded = function(e) {
            var child = e.node;
            var self = e.target;
            var layer = self.scene._layers.Canvas;
            if (child.childNodes) {
                child.addEventListener('childadded', __onchildadded);
                child.addEventListener('childremoved', __onchildremoved);
            }
            enchant.CanvasLayer._attachCache(child, layer);
            var render = new enchant.Event(enchant.Event.RENDER);
            layer._rendering(child, render);
        };

        var __onchildremoved = function(e) {
            var child = e.node;
            var self = e.target;
            var layer = self.scene._layers.Canvas;
            if (child.childNodes) {
                child.removeEventListener('childadded', __onchildadded);
                child.removeEventListener('childremoved', __onchildremoved);
            }
            enchant.CanvasLayer._detachCache(child, layer);
        };

        this.addEventListener('childremoved', __onchildremoved);
        this.addEventListener('childadded', __onchildadded);

    },
    /**
     * レンダリングを開始.
     * @private
     */
    _startRendering: function() {
        this.addEventListener('exitframe', this._onexitframe);
        this._onexitframe(new enchant.Event(enchant.Event.RENDER));
    },
    /**
     * レンダリングを停止.
     * @private
     */
    _stopRendering: function() {
        this.removeEventListener('render', this._onexitframe);
        this._onexitframe(new enchant.Event(enchant.Event.RENDER));
    },
    _onexitframe: function() {
        var game = enchant.Game.instance;
        var ctx = this.context;
        ctx.clearRect(0, 0, game.width, game.height);
        var render = new enchant.Event(enchant.Event.RENDER);
        this._rendering(this, render);
    },
    _rendering:  function(node, e) {
        var game = enchant.Game.instance;
        var matrix = enchant.Matrix.instance;
        var stack = matrix.stack;
        var ctx = this.context;
        var child;
        ctx.save();
        node.dispatchEvent(e);
        // composite
        if (node.compositeOperation) {
            ctx.globalCompositeOperation = node.compositeOperation;
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = (typeof node._opacity === 'number') ? node._opacity : 1.0;
        // transform
        this._transform(node, ctx);
        // render
        if (typeof node._visible === 'undefined' || node._visible) {
            if (node._backgroundColor) {
                ctx.fillStyle = node._backgroundColor;
                ctx.fillRect(0, 0, node._width, node._height);
            }

            if (node.cvsRender) {
                node.cvsRender(ctx);
            }

            if (game._debug) {
                if (node instanceof enchant.Label || node instanceof enchant.Sprite) {
                    ctx.strokeStyle = '#ff0000';
                } else {
                    ctx.strokeStyle = '#0000ff';
                }
                ctx.strokeRect(0, 0, node._width, node._height);
            }
            if (node._clipping) {
                ctx.clip();
            }
        }
        if (node.childNodes) {
            for (var i = 0, l = node.childNodes.length; i < l; i++) {
                child = node.childNodes[i];
                this._rendering(child, e);
            }
        }
        ctx.restore();
        enchant.Matrix.instance.stack.pop();
    },
    _detectrendering: function(node) {
        var ctx = this._dctx;
        var child;
        ctx.save();
        this._transform(node, ctx);
        ctx.fillStyle = node._cvsCache.detectColor;
        if (node.detectRender) {
            node.detectRender(ctx);
        } else {
            ctx.fillRect(0, 0, node.width, node.height);
        }
        if (node._clipping) {
            ctx.clip();
        }
        if (node.childNodes) {
            for (var i = 0, l = node.childNodes.length; i < l; i++) {
                child = node.childNodes[i];
                this._detectrendering(child);
            }
        }
        ctx.restore();
        enchant.Matrix.instance.stack.pop();
    },
    _transform: function(node, ctx) {
        var matrix = enchant.Matrix.instance;
        var stack = matrix.stack;
        var newmat;
        if (node._dirty) {
            matrix.makeTransformMatrix(node, node._cvsCache.matrix);
            newmat = [];
            matrix.multiply(stack[stack.length - 1], node._cvsCache.matrix, newmat);
            node._matrix = newmat;
        } else {
            newmat = node._matrix;
        }
        stack.push(newmat);
        ctx.setTransform.apply(ctx, newmat);
        var ox = (typeof node._originX === 'number') ? node._originX : node._width / 2 || 0;
        var oy = (typeof node._originY === 'number') ? node._originY : node._height / 2 || 0;
        var vec = [ ox, oy ];
        matrix.multiplyVec(newmat, vec, vec);
        node._offsetX = vec[0] - ox;
        node._offsetY = vec[1] - oy;
        node._dirty = false;

    },
    _determineEventTarget: function(e) {
        return this._getEntityByPosition(e.x, e.y);
    },
    _getEntityByPosition: function(x, y) {
        var game = enchant.Game.instance;
        var ctx = this._dctx;
        if (this._lastDetected < game.frame) {
            ctx.clearRect(0, 0, this.width, this.height);
            this._detectrendering(this);
            this._lastDetected = game.frame;
        }
        var color = ctx.getImageData(x, y, 1, 1).data;
        return this._colorManager.getSpriteByColor(color);
    }
});

enchant.CanvasLayer._attachCache = function(node, layer) {
    var child;
    if (!node._cvsCache) {
        node._cvsCache = {};
        node._cvsCache.matrix = [ 1, 0, 0, 1, 0, 0 ];
        node._cvsCache.detectColor = 'rgba(' + layer._colorManager.attachDetectColor(node) + ')';
    }
    if (node.childNodes) {
        for (var i = 0, l = node.childNodes.length; i < l; i++) {
            child = node.childNodes[i];
            enchant.CanvasLayer._attachCache(child, layer);
        }
    }
};

enchant.CanvasLayer._detachCache = function(node, layer) {
    var child;
    if (node._cvsCache) {
        layer._colorManager.detachDetectColor(node);
        delete node._cvsCache;
    }
    if (node.childNodes) {
        for (var i = 0, l = node.childNodes.length; i < l; i++) {
            child = node.childNodes[i];
            enchant.CanvasLayer._detachCache(child, layer);
        }
    }
};
