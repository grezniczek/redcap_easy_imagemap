<?php namespace DE\RUB\EasyImagemapExternalModule;

class MapDataHelper
{
    const SCHEMA_VERSION = 1;

    const MODES = ["2-way", "to-target", "from-target"];

    const STYLE_STATES = ["regular", "hover", "selected"];

    const STYLE_PROPS = ["fill", "stroke", "fillOpacity", "strokeOpacity", "strokeWidth"];

    const DEFAULT_STYLE_NAME = "default";

    public static function normalize($params)
    {
        if (!is_array($params) || empty($params)) {
            return self::emptyMap();
        }

        $bounds = [];
        if (isset($params["bounds"]) && is_array($params["bounds"])) {
            $bounds = self::normalizeBounds($params["bounds"]);
        }
        elseif (isset($params["_w"]) || isset($params["_h"])) {
            $bounds = self::normalizeBounds([
                "width" => $params["_w"] ?? 0,
                "height" => $params["_h"] ?? 0,
            ]);
        }

        $rawShapes = [];
        if (isset($params["shapes"]) && is_array($params["shapes"])) {
            $rawShapes = $params["shapes"];
        }
        else {
            foreach ($params as $key => $value) {
                if (is_array($value) && ($key === intval($key) || ctype_digit((string)$key))) {
                    $rawShapes[] = $value;
                }
            }
        }

        $styles = self::normalizeStyles($params["styles"] ?? []);
        $style_signatures = self::styleSignatures($styles);

        $shapes = [];
        foreach ($rawShapes as $shape) {
            $normalized = self::normalizeShape($shape, $styles, $style_signatures);
            if ($normalized !== null) {
                $shapes[] = $normalized;
            }
        }

        return [
            "version" => self::SCHEMA_VERSION,
            "bounds" => $bounds,
            "styles" => $styles,
            "shapes" => $shapes,
        ];
    }

    public static function normalizeBounds($bounds)
    {
        return [
            "width" => max(0, intval($bounds["width"] ?? 0)),
            "height" => max(0, intval($bounds["height"] ?? 0)),
        ];
    }

    public static function normalizeShape($shape, &$styles = null, &$style_signatures = null)
    {
        if (!is_array($shape)) {
            return null;
        }
        if (!is_array($styles)) {
            $styles = self::normalizeStyles([]);
        }
        if (!is_array($style_signatures)) {
            $style_signatures = self::styleSignatures($styles);
        }

        $mode = $shape["mode"] ?? "2-way";
        $item = [
            "target" => self::normalizeTarget(trim((string)($shape["target"] ?? ""))),
            "label" => trim((string)($shape["label"] ?? "")),
            "tooltip" => trim((string)($shape["tooltip"] ?? "")),
            "mode" => in_array($mode, self::MODES, true) ? $mode : "2-way",
            "style" => self::normalizeStyleReference($shape["style"] ?? self::DEFAULT_STYLE_NAME, $styles, $style_signatures),
        ];

        if (isset($shape["poly"]) || isset($shape["points"])) {
            $poly = self::normalizePoly($shape["poly"] ?? $shape["points"]);
            if ($poly === "") return null;
            $item["poly"] = $poly;
            return $item;
        }

        if (isset($shape["rect"]) && is_array($shape["rect"])) {
            $rect = self::normalizeRect($shape["rect"]);
            if ($rect === null) return null;
            $item["rect"] = $rect;
            return $item;
        }

        if (isset($shape["circle"]) && is_array($shape["circle"])) {
            $circle = self::normalizeCircle($shape["circle"]);
            if ($circle === null) return null;
            $item["circle"] = $circle;
            return $item;
        }

        if (isset($shape["ell"]) && is_array($shape["ell"])) {
            $ell = self::normalizeEllipse($shape["ell"]);
            if ($ell === null) return null;
            $item["ell"] = $ell;
            return $item;
        }

        return null;
    }

    public static function normalizeTarget($target)
    {
        if ($target === "") return "";
        return preg_replace("/::/", ":", $target, 1);
    }

    public static function normalizeStyle($style)
    {
        $full = self::expandStyle(is_array($style) ? $style : []);
        $fallbacks = self::styleFallbacks($full["regular"]);
        $normalized = [];
        if (!is_array($style)) return $normalized;

        foreach (self::STYLE_STATES as $state) {
            foreach (self::STYLE_PROPS as $prop) {
                if ($full[$state][$prop] !== $fallbacks[$state][$prop]) {
                    $normalized[$state][$prop] = $full[$state][$prop];
                }
            }
        }

        return $normalized;
    }

    public static function normalizeStyles($styles)
    {
        $normalized = [
            self::DEFAULT_STYLE_NAME => self::normalizeStyle(is_array($styles) ? ($styles[self::DEFAULT_STYLE_NAME] ?? []) : []),
        ];
        if (!is_array($styles)) return $normalized;

        foreach ($styles as $name => $style) {
            $name = self::normalizeStyleName($name);
            if ($name === "" || $name === self::DEFAULT_STYLE_NAME || !is_array($style)) continue;
            $normalized[$name] = self::normalizeStyle($style);
        }

        return $normalized;
    }

    public static function normalizeStyleName($name)
    {
        $name = trim((string)$name);
        $name = preg_replace('/\s+/', ' ', $name);
        if ($name === "" || strlen($name) > 64 || preg_match('/[\x00-\x1f\x7f]/', $name)) {
            return "";
        }
        return $name;
    }

    public static function getShapeType($shape)
    {
        foreach (["poly", "rect", "circle", "ell"] as $type) {
            if (isset($shape[$type]) && !empty($shape[$type])) return $type;
        }
        return "";
    }

    private static function emptyMap()
    {
        return [
            "version" => self::SCHEMA_VERSION,
            "bounds" => [],
            "styles" => [
                self::DEFAULT_STYLE_NAME => [],
            ],
            "shapes" => [],
        ];
    }

    private static function normalizeStyleReference($style, &$styles, &$style_signatures)
    {
        if (is_string($style)) {
            $name = self::normalizeStyleName($style);
            return $name === "" ? self::DEFAULT_STYLE_NAME : $name;
        }

        if (!is_array($style)) {
            return self::DEFAULT_STYLE_NAME;
        }

        $style = self::normalizeStyle($style);
        $signature = self::styleSignature($style);
        if (isset($style_signatures[$signature])) {
            return $style_signatures[$signature];
        }

        $idx = count($styles) + 1;
        do {
            $name = "style_$idx";
            $idx++;
        } while (isset($styles[$name]));

        $styles[$name] = $style;
        $style_signatures[$signature] = $name;
        return $name;
    }

    private static function styleSignatures($styles)
    {
        $signatures = [];
        foreach ($styles as $name => $style) {
            $signatures[self::styleSignature($style)] = $name;
        }
        return $signatures;
    }

    private static function styleSignature($style)
    {
        return json_encode(self::expandStyle(self::normalizeStyle($style)));
    }

    private static function expandStyle($style)
    {
        $regular_fallback = self::baseStyleDefaults()["regular"];
        $regular = self::mergeStyleState($regular_fallback, $style["regular"] ?? []);
        $defaults = self::styleFallbacks($regular);
        $expanded = ["regular" => $regular];
        foreach (["hover", "selected"] as $state) {
            $expanded[$state] = self::mergeStyleState($defaults[$state], $style[$state] ?? []);
        }
        return $expanded;
    }

    private static function styleFallbacks($regular)
    {
        return [
            "regular" => self::baseStyleDefaults()["regular"],
            "hover" => ["fill" => $regular["fill"], "stroke" => $regular["stroke"], "fillOpacity" => 0.2, "strokeOpacity" => $regular["strokeOpacity"], "strokeWidth" => $regular["strokeWidth"]],
            "selected" => ["fill" => $regular["fill"], "stroke" => $regular["stroke"], "fillOpacity" => 0.4, "strokeOpacity" => $regular["strokeOpacity"], "strokeWidth" => $regular["strokeWidth"]],
        ];
    }

    private static function baseStyleDefaults()
    {
        return [
            "regular" => ["fill" => "#ffa500", "stroke" => "#ffa500", "fillOpacity" => 0.05, "strokeOpacity" => 1.0, "strokeWidth" => 1.0],
        ];
    }

    private static function mergeStyleState($fallback, $style)
    {
        if (!is_array($style)) return $fallback;
        $merged = $fallback;
        foreach (self::STYLE_PROPS as $prop) {
            if (!array_key_exists($prop, $style)) continue;
            $value = $style[$prop];
            if (in_array($prop, ["fillOpacity", "strokeOpacity"], true)) {
                $merged[$prop] = max(0, min(1, floatval($value)));
            }
            elseif ($prop === "strokeWidth") {
                $merged[$prop] = max(0, min(20, floatval($value)));
            }
            elseif (is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
                $merged[$prop] = strtolower($value);
            }
        }
        return $merged;
    }

    private static function normalizePoly($poly)
    {
        $pairs = preg_split('/\s+/', trim((string)$poly));
        $normalized = [];
        foreach ($pairs as $pair) {
            if (!preg_match('/^\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s*$/', $pair, $m)) {
                continue;
            }
            $normalized[] = self::formatNumber($m[1]) . "," . self::formatNumber($m[2]);
        }
        return count($normalized) >= 3 ? implode(" ", $normalized) : "";
    }

    private static function normalizeRect($rect)
    {
        $x = floatval($rect["x"] ?? 0);
        $y = floatval($rect["y"] ?? 0);
        $width = floatval($rect["width"] ?? 0);
        $height = floatval($rect["height"] ?? 0);
        if ($width <= 0 || $height <= 0) return null;
        return [
            "x" => self::formatNumber($x),
            "y" => self::formatNumber($y),
            "width" => self::formatNumber($width),
            "height" => self::formatNumber($height),
            "angle" => self::formatNumber($rect["angle"] ?? 0),
        ];
    }

    private static function normalizeCircle($circle)
    {
        $cx = floatval($circle["cx"] ?? 0);
        $cy = floatval($circle["cy"] ?? 0);
        $r = floatval($circle["r"] ?? 0);
        if ($r <= 0) return null;
        return [
            "cx" => self::formatNumber($cx),
            "cy" => self::formatNumber($cy),
            "r" => self::formatNumber($r),
        ];
    }

    private static function normalizeEllipse($ell)
    {
        $cx = floatval($ell["cx"] ?? 0);
        $cy = floatval($ell["cy"] ?? 0);
        $rx = floatval($ell["rx"] ?? 0);
        $ry = floatval($ell["ry"] ?? 0);
        if ($rx <= 0 || $ry <= 0) return null;
        return [
            "cx" => self::formatNumber($cx),
            "cy" => self::formatNumber($cy),
            "rx" => self::formatNumber($rx),
            "ry" => self::formatNumber($ry),
            "angle" => self::formatNumber($ell["angle"] ?? 0),
        ];
    }

    private static function formatNumber($value)
    {
        $number = round(floatval($value), 2);
        return $number == intval($number) ? intval($number) : $number;
    }
}
