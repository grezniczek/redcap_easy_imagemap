<?php 

namespace DE\RUB\EasyImagemapExternalModule;

/**
 * Helper for injecting JavaScript and CSS resources into REDCap pages.
 *
 * @version v20260621
 */
class InjectionHelper
{

    /** @var AbstractExternalModule $module */
    private $module = null;
    private $basePath;

    private function __construct($module)
    {
        $this->module = $module;
        $this->basePath = $module->getModulePath();
    }

    /**
     * Escapes text for safe use in HTML attributes.
     * @param string $text
     * @return string
     */
    private function escapeAttribute($text)
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * Prevents inline JavaScript from closing the surrounding script element.
     * @param string $script
     * @return string
     */
    private function escapeInlineScript($script)
    {
        return preg_replace('/<\s*\/\s*script/i', '<\/script', $script);
    }

    /**
     * Prevents inline CSS from closing the surrounding style element.
     * @param string $css
     * @return string
     */
    private function escapeInlineStyle($css)
    {
        return preg_replace('/<\s*\/\s*style/i', '<\/style', $css);
    }

    /**
     * Requires injectable files to use the expected lowercase extension.
     * @param string $file
     * @param string $extension
     * @return void
     */
    private function requireExtension($file, $extension)
    {
        if (substr($file, -strlen($extension)) !== $extension) {
            throw new \InvalidArgumentException("Injected file must have a {$extension} extension.");
        }
    }

    /**
     * Checks whether the given path is absolute.
     * @param string $file
     * @return bool
     */
    private function isAbsolutePath($file)
    {
        return strlen($file) > 0
            && (
                $file[0] === "/"
                || preg_match('/^[A-Za-z]:[\/\\\\]/', $file)
            );
    }

    /**
     * Resolves an injectable file path and optionally confines it to the module root.
     * @param string $file
     * @param bool $confine_to_em_root
     * @return string
     */
    private function resolveFile($file, $confine_to_em_root)
    {
        $path = $this->isAbsolutePath($file) ? $file : $this->basePath . $file;
        $realPath = realpath($path);
        if ($realPath === false || !is_file($realPath)) {
            throw new \InvalidArgumentException("Injected file does not exist.");
        }

        if ($confine_to_em_root) {
            $realBasePath = realpath($this->basePath);
            if ($realBasePath === false) {
                throw new \RuntimeException("Module path could not be resolved.");
            }
            $basePath = rtrim(str_replace("\\", "/", $realBasePath), "/") . "/";
            $realPathForComparison = str_replace("\\", "/", $realPath);
            if (strpos($realPathForComparison, $basePath) !== 0) {
                throw new \InvalidArgumentException("Injected file must be inside the module root.");
            }
        }

        return $realPath;
    }

    public static function init($module)
    {
        if ($module->framework == null) {
            throw new \Exception("Not supported for framework v1 modules!");
        }
        return new InjectionHelper($module);
    }

    /**
     * Includes a JS file (either in-line or as a separately loaded resource).
     * @param string $file The path of the JS file relative to the module folder without leading slash.
     * @param bool $inline Determines whether the script will be inlined or loaded as a separate resource.
     * @param bool $confine_to_em_root Whether the file must be located inside the module root.
     */
    public function js($file, $inline = false, $confine_to_em_root = true)
    {
        $this->requireExtension($file, ".js");
        if ($inline) {
            $script = file_get_contents($this->resolveFile($file, $confine_to_em_root));
            $script = $this->escapeInlineScript($script);
            echo "<script type=\"text/javascript\">\n{$script}\n</script>";
        } else {
            if ($confine_to_em_root) {
                $this->resolveFile($file, true);
            }
            $src = $this->escapeAttribute($this->module->framework->getUrl($file));
            echo '<script type="text/javascript" src="' . $src . '"></script>';
        }
    }

    /**
     * Includes a CSS file (either in-line or as a separately loaded resource).
     * @param string $file The path of the CSS file relative to the module folder.
     * @param bool $inline Determines whether the styles will be inlined or loaded as a separate resource.
     * @param bool $confine_to_em_root Whether the file must be located inside the module root.
     */
    public function css($file, $inline = false, $confine_to_em_root = true)
    {
        $this->requireExtension($file, ".css");
        if ($inline) {
            $css = file_get_contents($this->resolveFile($file, $confine_to_em_root));
            $css = $this->escapeInlineStyle($css);
            echo "<style>\n{$css}\n</style>\n";
        } else {
            if ($confine_to_em_root) {
                $this->resolveFile($file, true);
            }
            $css = json_encode(
                $this->module->framework->getUrl($file),
                JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            );
            $file = md5($file);
            echo "<script type=\"text/javascript\">
                    (function() {
                        var id = 'emcCSS{$file}'
                        if (!document.getElementById(id)) {
                            var head = document.getElementsByTagName('head')[0]
                            var link = document.createElement('link')
                            link.id = id
                            link.rel = 'stylesheet'
                            link.type = 'text/css'
                            link.href = {$css}
                            link.media = 'all'
                            head.appendChild(link)
                        }
                    })();
                </script>";
        }
    }
}
