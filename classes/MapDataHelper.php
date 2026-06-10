<?php namespace DE\RUB\EasyImagemapExternalModule;

class MapDataHelper
{
    const SCHEMA_VERSION = 1;

    const MODES = ["2-way", "to-target", "from-target"];

    const STYLE_STATES = ["regular", "hover", "selected"];

    const STYLE_PROPS = ["fill", "stroke", "fillOpacity", "strokeOpacity", "strokeWidth"];

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

        $shapes = [];
        foreach ($rawShapes as $shape) {
            $normalized = self::normalizeShape($shape);
            if ($normalized !== null) {
                $shapes[] = $normalized;
            }
        }

        return [
            "version" => self::SCHEMA_VERSION,
            "bounds" => $bounds,
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

    public static function normalizeShape($shape)
    {
        if (!is_array($shape)) {
            return null;
        }

        $mode = $shape["mode"] ?? "2-way";
        $item = [
            "target" => self::normalizeTarget(trim((string)($shape["target"] ?? ""))),
            "label" => trim((string)($shape["label"] ?? "")),
            "tooltip" => trim((string)($shape["tooltip"] ?? "")),
            "mode" => in_array($mode, self::MODES, true) ? $mode : "2-way",
            "style" => self::normalizeStyle($shape["style"] ?? []),
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
        $normalized = [];
        if (!is_array($style)) return $normalized;

        foreach (self::STYLE_STATES as $state) {
            $stateStyle = $style[$state] ?? [];
            if (!is_array($stateStyle)) continue;
            $normalized[$state] = [];
            foreach (self::STYLE_PROPS as $prop) {
                if (!array_key_exists($prop, $stateStyle)) continue;
                $value = $stateStyle[$prop];
                if (in_array($prop, ["fillOpacity", "strokeOpacity"], true)) {
                    $normalized[$state][$prop] = max(0, min(1, floatval($value)));
                }
                elseif ($prop === "strokeWidth") {
                    $normalized[$state][$prop] = max(0, min(20, floatval($value)));
                }
                elseif (is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
                    $normalized[$state][$prop] = strtolower($value);
                }
            }
            if (empty($normalized[$state])) {
                unset($normalized[$state]);
            }
        }

        return $normalized;
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
            "shapes" => [],
        ];
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
