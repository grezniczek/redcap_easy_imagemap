<?php

namespace DE\RUB\EasyImagemapExternalModule;

require_once __DIR__ . "/../classes/MapDataHelper.php";
require_once __DIR__ . "/../classes/ActionTagHelper.php";

use DE\RUB\EasyImagemapExternalModule\ActionTagHelper;
use DE\RUB\EasyImagemapExternalModule\MapDataHelper;

function assert_true($condition, $message)
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: $message\n");
        exit(1);
    }
}

$empty = MapDataHelper::normalize([]);
assert_true($empty["version"] === 1, "Empty maps use schema version 1.");
assert_true($empty["shapes"] === [], "Empty maps have no shapes.");

$legacy = MapDataHelper::normalize([
    "1" => [
        "points" => "10,10 50,10 50,40",
        "target" => "joints::1",
        "label" => "Joint 1",
    ],
    "_w" => 500,
    "_h" => 250,
]);
assert_true($legacy["bounds"]["width"] === 500, "Legacy width is normalized.");
assert_true($legacy["bounds"]["height"] === 250, "Legacy height is normalized.");
assert_true($legacy["shapes"][0]["poly"] === "10,10 50,10 50,40", "Legacy points become poly.");
assert_true($legacy["shapes"][0]["target"] === "joints:1", "Legacy checkbox target uses a single colon.");

$canonical = MapDataHelper::normalize([
    "version" => 1,
    "bounds" => ["width" => 100, "height" => 80],
    "shapes" => [
        [
            "rect" => ["x" => 1, "y" => 2, "width" => 30, "height" => 40, "angle" => 15],
            "target" => "field:a",
            "mode" => "from-target",
            "style" => [
                "selected" => [
                    "fill" => "#ff0000",
                    "stroke" => "#00ff00",
                    "fillOpacity" => 0.75,
                    "strokeOpacity" => 0.5,
                    "strokeWidth" => 3,
                ],
            ],
        ],
        [
            "circle" => ["cx" => 25, "cy" => 30, "r" => 12],
            "target" => "field:c",
        ],
        [
            "ell" => ["cx" => 10, "cy" => 20, "rx" => 5, "ry" => 6, "angle" => 30],
            "target" => "field:b",
        ],
    ],
]);
assert_true(MapDataHelper::getShapeType($canonical["shapes"][0]) === "rect", "Rectangles are detected.");
assert_true($canonical["shapes"][0]["rect"]["angle"] === 15, "Rectangle angles are preserved.");
assert_true(MapDataHelper::getShapeType($canonical["shapes"][1]) === "circle", "Circles are detected.");
assert_true(MapDataHelper::getShapeType($canonical["shapes"][2]) === "ell", "Ellipses are detected.");
assert_true($canonical["shapes"][2]["ell"]["angle"] === 30, "Ellipse angles are preserved.");
assert_true($canonical["shapes"][0]["style"] !== "default", "Inline styles are converted to a named style.");
assert_true($canonical["styles"][$canonical["shapes"][0]["style"]]["selected"]["fill"] === "#ff0000", "Converted styles are preserved.");

$named_styles = MapDataHelper::normalize([
    "version" => 1,
    "bounds" => ["width" => 100, "height" => 80],
    "styles" => [
        "default" => [],
        "warning" => [
            "regular" => ["fill" => "#ff0000"],
        ],
    ],
    "shapes" => [
        [
            "circle" => ["cx" => 25, "cy" => 30, "r" => 12],
            "target" => "field:c",
            "style" => "warning",
        ],
    ],
]);
assert_true(array_key_exists("default", $named_styles["styles"]), "Default named style is always present.");
assert_true($named_styles["shapes"][0]["style"] === "warning", "Named style references are preserved.");

$tags = ActionTagHelper::parseActionTags('@EASYIMAGEMAP={"version":1,"bounds":{"width":1,"height":1},"shapes":[]} @OTHER=1', '@EASYIMAGEMAP');
assert_true(count($tags) === 1, "Action tag helper filters tags.");
assert_true($tags[0]["match"] === '@EASYIMAGEMAP={"version":1,"bounds":{"width":1,"height":1},"shapes":[]}', "Action tag helper returns the current match.");

fwrite(STDOUT, "MapDataHelper smoke tests passed.\n");
