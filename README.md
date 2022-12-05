# Easy Imagemap

A REDCap external module that converts images in descriptive fields into clickable image maps.

This EM was inspired by the Custom Imagemap EM and https://www.image-map.net/ and the frustration of this being so complicated.

## @EASYIMAGEMAP Action Tag

Add this to any descriptive field that has an inline image. Once added, Online Designer will show a "Configure Imagemap" button inside the field. Use this to configure the image map. Configuration will be saved as a JSON data structure argument of the `@EASIMAGEMAP` action tag. This parameter may be edited manually, but it's structure must remain intact in order for this module to be able to parse it.



## TODOs

- Allow other sources than descriptive field images, such as (public) File Repository files
- Allow circles/ellipses and rectangles

