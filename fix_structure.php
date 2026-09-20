<?php
require_once 'vendor/autoload.php';
$content_dir = __DIR__ . '/content';

foreach (['server_intro.yml', 'personal_site.yml'] as $file) {
    $path = $content_dir . '/' . $file;
    if (file_exists($path)) {
        $data = spyc_load_file($path);
        // data is a top-level array. Wrap it in 'posts' key
        if (isset($data[0])) { // is sequential array
            file_put_contents($path, spyc_dump(['posts' => $data]));
            echo "Wrapped $file in 'posts' key.\n";
        }
    }
}
