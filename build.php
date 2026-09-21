<?php
require_once 'vendor/autoload.php';

$content_dir = __DIR__ . '/content';
$docs_dir = __DIR__ . '/docs';

if (!file_exists($docs_dir)) {
    mkdir($docs_dir, 0777, true);
}
if (!file_exists($docs_dir . '/images')) {
    mkdir($docs_dir . '/images', 0777, true);
}

// content/images をコピー
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($content_dir . '/images', RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
);
foreach ($iterator as $item) {
    if ($item->isFile()) {
        copy($item->getPathname(), $docs_dir . '/images/' . $item->getFilename());
    }
}
// 既存の images の一部もコピー (プロフ画像等)
if (file_exists(__DIR__ . '/images/profile.png')) {
    copy(__DIR__ . '/images/profile.png', $docs_dir . '/images/profile.png');
}

$parsedown = new Parsedown();
$posts_by_tag = [];
$all_tags_set = [];

use Symfony\Component\Yaml\Yaml;

// data.yml から読み込む
$data_file_1 = $content_dir . '/server_intro.yml';
$data_file_2 = $content_dir . '/personal_site.yml';
$links_file = $content_dir . '/links.yml';

$data = [];
if (file_exists($data_file_1)) {
    $d1 = Yaml::parseFile($data_file_1);
    if (isset($d1['posts']) && is_array($d1['posts'])) {
        $data = array_merge($data, $d1['posts']);
    }
}
if (file_exists($data_file_2)) {
    $d2 = Yaml::parseFile($data_file_2);
    if (isset($d2['posts']) && is_array($d2['posts'])) {
        $data = array_merge($data, $d2['posts']);
    }
}

$top_links = [];
if (file_exists($links_file)) {
    $d_links = Yaml::parseFile($links_file);
    if (isset($d_links['links']) && is_array($d_links['links'])) {
        $top_links = $d_links['links'];
    }
}

if (!empty($data)) {
    foreach ($data as $index => $item) {
            $post = [
                'id' => uniqid(),
                'title' => $item['title'] ?? '',
                'tag' => $item['tag'] ?? 'その他',
                'sort_order' => $index, // 配列のインデックス順 = 表示順
                'created_at' => date('Y-m-d H:i:s'),
                'image_path' => $item['image'] ?? '',
                'code_title' => $item['code_title'] ?? '',
                'code_lang' => $item['code_lang'] ?? 'php', // デフォルトはphpにしておく
                'code' => $item['code'] ?? '',
            ];
            
            $body_text = $item['body'] ?? '';
            
            // 古いMarkdown画像の記述が本文に残っている場合は除去し、image_pathが未設定なら流用する
            if (preg_match('/!\[.*?\]\((.*?)\)/', $body_text, $img_match)) {
                if (empty($post['image_path'])) {
                    $post['image_path'] = str_replace('../images/', 'images/', $img_match[1]);
                }
            }
            // 全てのMarkdown画像を本文から除去する
            $body_text = preg_replace('/!\[.*?\]\(.*?\)/', '', $body_text);
            
            // 古いMarkdownのリンク [テキスト](URL) を URL のみに置換する
            $body_text = preg_replace('/\[.*?\]\((.*?)\)/', '$1', $body_text);
            
            // Markdownとしてリッチテキスト化せず、プレーンテキストとしてHTML表示する
            $body_text = htmlspecialchars(trim($body_text));
            // URLが含まれる場合は自動リンク化
            $body_text = preg_replace('/(https?:\/\/[^\s<]+)/', '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>', $body_text);
            $post['body'] = nl2br($body_text);
            
            $tags = is_array($post['tag']) ? $post['tag'] : explode(',', $post['tag']);
            $tags = array_map('trim', $tags);
            foreach ($tags as $t) {
                if ($t !== '') {
                    $all_tags_set[$t] = true;
                    if (!isset($posts_by_tag[$t])) {
                        $posts_by_tag[$t] = [];
                    }
                    $posts_by_tag[$t][] = $post;
                }
            }
        }
    }

$all_tags = array_keys($all_tags_set);
sort($all_tags);
$default_tag = '１学期後半';

$settings_file = $content_dir . '/settings.yml';
if (file_exists($settings_file)) {
    $settings = Yaml::parseFile($settings_file);
    if (isset($settings['default_tag']) && $settings['default_tag'] !== '') {
        $default_tag = $settings['default_tag'];
    }
}

if (!in_array($default_tag, $all_tags)) {
    $all_tags[] = $default_tag;
}

// タグ内の並び順も data.yml の順（sort_order）にする
foreach ($posts_by_tag as $tag => &$posts) {
    usort($posts, function($a, $b) {
        return $a['sort_order'] - $b['sort_order'];
    });
}
unset($posts);
$view_logs = false;

$all_posts = [];
foreach ($posts_by_tag as $tag => $posts_in_tag) {
    foreach ($posts_in_tag as $p) {
        if (!isset($p['tags_array'])) $p['tags_array'] = [];
        $p['tags_array'][] = $tag;
        $all_posts[] = $p;
    }
}
$unique_posts = [];
$seen_ids = [];
foreach ($all_posts as $p) {
    if (!isset($seen_ids[$p['id']])) {
        $all_tags_for_post = [];
        foreach ($all_posts as $p2) {
            if ($p['id'] === $p2['id']) {
                $all_tags_for_post = array_merge($all_tags_for_post, $p2['tags_array']);
            }
        }
        $p['tags_array'] = array_unique($all_tags_for_post);
        $seen_ids[$p['id']] = true;
        $unique_posts[] = $p;
    }
}

usort($unique_posts, function($a, $b) {
    return $a['sort_order'] - $b['sort_order'];
});

$posts = $unique_posts;

ob_start();
require 'template.php';
$html = ob_get_clean();

file_put_contents($docs_dir . '/index.html', $html);

$files = glob($docs_dir . '/*.html');
foreach ($files as $file) {
    if (basename($file) !== 'index.html') {
        unlink($file);
    }
}

echo "Build completed.\n";

