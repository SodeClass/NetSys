<?php
// 静的サイト用テンプレート
?>
<!DOCTYPE html>
<html lang="ja" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ネットワークシステム実習資料</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
    <!-- Prism.js 用に独自の完全一致VSCode Dark+テーマを定義するため、外部CSSは外します -->
    <style>
        html {
            overflow-y: scroll;
        }
        :root { 
            --pico-font-size: 100%; 
            --pico-background-color: #f8f9fa; /* 背景を少しだけグレーにしてボタンを目立たせる */
        }
        body {
            background-color: var(--pico-background-color);
        }
        .container { 
            padding-top: 2rem; 
            margin: 0 auto;
        }

        /* プロフィール風ヘッダー */
        .profile-header {
            text-align: center;
            margin-bottom: 2rem;
        }
        .profile-title {
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
            font-weight: bold;
        }
        .profile-desc {
            margin: 0;
            font-size: 1rem;
            color: var(--pico-muted-color);
        }
        /* ボタン風の記事リスト */
        article { 
            border: none;
            border-radius: 20px; /* 大きめの角丸 */
            background-color: #ffffff;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05); /* 軽い影 */
            margin-bottom: 1.5rem;
            padding: 1.5rem;
            text-align: left; /* 中身は左揃え */
        }
        .post-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .post-header h3 { 
            margin: 0; 
            font-size: 1.25rem; 
            color: var(--pico-h1-color);
        }
        .post-image { 
            max-width: 100%; 
            border-radius: 10px;
            height: auto; 
            margin-bottom: 1rem; 
        }
        .sort-links {
            text-align: center;
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
        /* コードブロック用のスタイル (VSCode風) */
        /* コードブロック用のスタイル (VSCode Dark+ 完全一致) */
        .code-container {
            margin-top: 1rem;
            margin-bottom: 1rem;
            background-color: #1e1e1e; /* Editor Background */
            border-radius: 6px;
            overflow: hidden; 
            border: 1px solid #3c3c3c; /* VSCode border color */
            font-family: Consolas, "Courier New", monospace;
        }
        .code-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #252526; /* Editor Group Header Background */
            padding: 0;
            border-bottom: 1px solid #3c3c3c;
        }
        .code-header-title {
            background-color: #1e1e1e; /* Active Tab Background */
            color: #e2e2e2;
            padding: 0.5rem 1rem;
            font-size: 0.85rem;
            border-right: 1px solid #2d2d2d;
            border-top: 1px solid #007fd4; /* Active Tab Top Border */
        }
        
        .code-container pre {
            margin: 0;
            padding: 1rem;
            overflow-x: auto;
            font-size: 0.9rem;
            line-height: 1.5;
            tab-size: 4;
        }
        
        /* Prism.jsのスタイルをVSCode Dark+に完全上書き (公式テーマ使用) */
        pre[class*="language-"],
        code[class*="language-"] {
            color: #d4d4d4;
            font-size: 13px;
            text-shadow: none;
            font-family: Consolas, "Courier New", monospace;
            direction: ltr;
            text-align: left;
            white-space: pre;
            word-spacing: normal;
            word-break: normal;
            line-height: 1.5;
            -moz-tab-size: 4;
            -o-tab-size: 4;
            tab-size: 4;
            -webkit-hyphens: none;
            -moz-hyphens: none;
            -ms-hyphens: none;
            hyphens: none;
        }

        pre[class*="language-"]::selection,
        code[class*="language-"]::selection,
        pre[class*="language-"] *::selection,
        code[class*="language-"] *::selection {
            text-shadow: none;
            background: #264F78;
        }

        @media print {
            pre[class*="language-"],
            code[class*="language-"] {
                text-shadow: none;
            }
        }

        .code-container pre[class*="language-"] {
            padding: 1rem;
            margin: 0;
            overflow: auto;
            background: transparent; /* コンテナの背景色に合わせる */
        }

        :not(pre) > code[class*="language-"] {
            padding: .1em .3em;
            border-radius: .3em;
            color: #db4c69;
            background: #1e1e1e;
        }
        /*********************************************************
        * Tokens
        */
        .namespace {
            opacity: .7;
        }

        .token.doctype,
        .token.doctype .token.doctype-tag,
        .token.doctype .token.name,
        .token.doctype .token.punctuation {
            color: #00ff7f !important; /* DOCTYPEは緑色に */
        }

        .token.comment {
            color: #808080; /* コメント: 灰色 */
        }

        .token.prolog {
            color: #d4d4d4; /* prologの中身を灰色にしない */
        }

        /* <?php ?> などのPHPタグ自体を青色に */
        .token.delimiter {
            color: #569CD6 !important;
        }

        .token.punctuation,
        .language-html .language-css .token.punctuation,
        .language-html .language-javascript .token.punctuation {
            color: #d4d4d4;
        }

        .token.property,
        .token.boolean,
        .token.number,
        .token.constant,
        .token.symbol,
        .token.inserted,
        .token.unit {
            color: #b5cea8;
        }

        .token.tag {
            color: green;
        }

        .token.selector,
        .token.builtin,
        .token.deleted {
            color: #ce9178;
        }

        .token.attr-name {
            color: #9cdcfe; /* 属性名: 水色 */
        }

        .token.string,
        .token.char {
            color: #9cdcfe !important; /* クオーテーション内の文字色を水色に */
        }

        .language-css .token.string.url {
            text-decoration: underline;
        }

        .token.operator,
        .token.entity {
            color: #d4d4d4;
        }

        .token.operator.arrow {
            color: #569CD6;
        }

        .token.atrule {
            color: #ce9178;
        }

        .token.atrule .token.rule {
            color: #c586c0;
        }

        .token.atrule .token.url {
            color: #9cdcfe;
        }

        .token.atrule .token.url .token.function {
            color: #dcdcaa;
        }

        .token.atrule .token.url .token.punctuation {
            color: #d4d4d4;
        }

        .token.keyword {
            color: #569CD6;
        }

        .token.keyword.module,
        .token.keyword.control-flow {
            color: #c586c0;
        }

        .token.function,
        .token.function .token.maybe-class-name {
            color: #dcdcaa;
        }

        .token.regex {
            color: #d16969;
        }

        .token.important {
            color: #569cd6;
        }

        .token.italic {
            font-style: italic;
        }

        .token.constant {
            color: #9cdcfe;
        }

        .token.class-name,
        .token.maybe-class-name {
            color: #4ec9b0;
        }

        .token.console {
            color: #9cdcfe;
        }

        .token.parameter {
            color: #9cdcfe;
        }

        .token.interpolation {
            color: #9cdcfe;
        }

        .token.punctuation.interpolation-punctuation {
            color: #569cd6;
        }

        .token.boolean {
            color: #569cd6;
        }

        .token.property,
        .token.imports .token.maybe-class-name,
        .token.exports .token.maybe-class-name {
            color: #9cdcfe;
        }
        
        .token.variable {
            color: #d4d4d4 !important; /* $password, $_POST などは白色 */
        }

        .token.selector {
            color: #d7ba7d;
        }

        .token.escape {
            color: #d7ba7d;
        }

        /* const を赤色に指定 */
        .token.keyword.keyword-const,
        .token.keyword-const {
            color: red !important;
        }
        
        /* if, return, endif, isset, exit を紫色に指定 */
        .token.keyword.keyword-control,
        .token.keyword-control {
            color:plum !important;
        }
        
        /* 括弧 (), {}, [] をオレンジ色に指定 */
        .token.punctuation.punctuation-bracket {
            color: #FAC61E !important;
        }

        /* 100vh, 3rem などの数値・単位を薄緑色に指定 */
        .token.number,
        .token.unit {
            color: #b5cea8 !important;
        }

        /* 色指定やauto、フォント名などの値をオレンジ色に指定 */
        .token.color,
        .token.custom-orange {
            color: #ce9178 !important; /* オレンジ色 */
        }

        .token.tag {
            color: #00ff7f; /* タグ名: 鮮やかな緑色(SpringGreen) */
        }

        .token.tag .token.punctuation {
            color: #808080; /* < や > は灰色 */
        }

        .token.cdata {
            color: #808080;
        }

        .token.attr-name {
            color: #9cdcfe; /* 属性名: 水色 */
        }

        .token.attr-value,
        .token.attr-value .token.punctuation,
        .token.attr-value .language-css,
        .token.attr-value .language-css * {
            color: #9cdcfe !important; /* HTML属性値（style属性の中身含む）は水色 */
        }

        .token.attr-value .token.punctuation.attr-equals {
            color: #d4d4d4;
        }

        .token.entity {
            color: #569cd6;
        }

        .token.namespace {
            color: #4ec9b0;
        }
        /*********************************************************
        * Language Specific
        */

        pre[class*="language-javascript"],
        code[class*="language-javascript"],
        pre[class*="language-jsx"],
        code[class*="language-jsx"],
        pre[class*="language-typescript"],
        code[class*="language-typescript"],
        pre[class*="language-tsx"],
        code[class*="language-tsx"] {
            color: #9cdcfe;
        }

        pre[class*="language-css"],
        code[class*="language-css"] {
            color: #ce9178;
        }

        pre[class*="language-html"],
        code[class*="language-html"] {
            color: #d4d4d4;
        }

        .language-regex .token.anchor {
            color: #dcdcaa;
        }

        .language-html .token.punctuation {
            color: #808080;
        }
        /*********************************************************
        * Line highlighting
        */
        pre[class*="language-"] > code[class*="language-"] {
            position: relative;
            z-index: 1;
        }

        .line-highlight.line-highlight {
            background: #f7ebc6;
            box-shadow: inset 5px 0 0 #f7d87c;
            z-index: 0;
        }

        /* スクロールバーのカスタマイズ (VSCode風) */
        .code-container pre::-webkit-scrollbar {
            height: 10px;
            width: 10px;
        }
        .code-container pre::-webkit-scrollbar-track {
            background: #1e1e1e; 
        }
        .code-container pre::-webkit-scrollbar-thumb {
            background: #424242; 
        }
        .code-container pre::-webkit-scrollbar-thumb:hover {
            background: #4f4f4f; 
        }

        .copy-button {
            background-color: transparent;
            border: none;
            color: #cccccc;
            padding: 0.3rem 0.6rem;
            margin-right: 0.5rem;
            cursor: pointer;
            font-size: 0.8rem;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        .copy-button:hover {
            background-color: #3c3c3c;
            color: #ffffff;
        }
    </style>
</head>
<body>
    <main class="container">
        <header class="profile-header">
            <h1 class="profile-title"><a href="index.html" class="contrast" style="text-decoration: none;">ネットワークシステム実習資料</a></h1>
            <div style="display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
                <a href="network-simulator/index.html" target="_blank" role="button" class="outline">ネットワークシミュレータ</a>
            <?php if (!empty($top_links)): ?>
                <?php foreach ($top_links as $link): ?>
                        <a href="<?php echo htmlspecialchars($link['url'], ENT_QUOTES, 'UTF-8'); ?>" target="_blank" role="button" class="outline"><?php echo htmlspecialchars($link['text'], ENT_QUOTES, 'UTF-8'); ?></a>
                <?php endforeach; ?>
            <?php endif; ?>
            </div>
        </header>

        <!-- タグ・ソート順の切り替えリンク -->
        <div class="sort-links">
            <div style="margin-bottom: 0.5rem;" id="tag-menu">
                表示タグ:
                <?php if (!in_array($default_tag, $all_tags)) $all_tags[] = $default_tag; ?>
                <?php foreach (array_unique($all_tags) as $t): ?>
                    <a href="javascript:void(0);" 
                       data-tag="<?php echo htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); ?>"
                       class="tag-link <?php echo $t === $default_tag ? 'active-tag' : ''; ?>"
                       style="<?php echo $t === $default_tag ? 'font-weight:bold; pointer-events:none; color: var(--pico-color);' : ''; ?>">
                       <?php echo htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); ?>
                    </a> |
                <?php endforeach; ?>
            </div>
            
        </div>

        <!-- 記事一覧の表示領域 -->
        <section id="feed">
            <p id="empty-message" style="text-align: center; display: <?php echo empty($posts) ? 'block' : 'none'; ?>;">記事はまだありません。</p>
            <?php if (!empty($posts)): ?>
                <?php foreach ($posts as $p): ?>
                    <article class="post-article" data-tags="<?php echo htmlspecialchars(json_encode($p['tags_array']), ENT_QUOTES, 'UTF-8'); ?>" style="<?php echo in_array($default_tag, $p['tags_array']) ? '' : 'display: none;' ?>">
                        <header class="post-header">
                            <h3><?php echo htmlspecialchars($p['title'], ENT_QUOTES, 'UTF-8'); ?></h3>
                            <?php if (!empty($p['tag'])): ?>
                                <?php 
                                $tags = is_array($p['tag']) ? $p['tag'] : array_filter(array_map('trim', explode(',', (string)$p['tag'])));
                                foreach ($tags as $t): 
                                ?>
                                    <span style="display: inline-block; background: var(--pico-primary-background); color: var(--pico-primary-inverse); padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.8rem; margin-right: 0.2rem;">
                                        #<?php echo htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); ?>
                                    </span>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </header>
                        <?php if (!empty($p['image_path'])): ?>
                            <img src="<?php echo htmlspecialchars($p['image_path'], ENT_QUOTES, 'UTF-8'); ?>" class="post-image" alt="">
                        <?php endif; ?>
                        <div class="post-content" style="margin-bottom: 0; color: var(--pico-color);">
                            <?php echo $p['body']; ?>
                        </div>
                        
                        <?php if (!empty($p['code'])): ?>
                            <div class="code-container">
                                <div class="code-header">
                                    <div class="code-header-title">
                                        <span><?php echo htmlspecialchars(!empty($p['code_title']) ? $p['code_title'] : '', ENT_QUOTES, 'UTF-8'); ?></span> <!-- VSCodeっぽくファイル名風に表示 -->
                                    </div>
                                    <button class="copy-button" onclick="copyCode(this)">Copy</button>
                                </div>
                                <!-- Prism.js用に class="language-php" を指定 (自動判別も可能ですが汎用的にhtml/php系としています) -->
                                <pre><code class="language-<?php echo htmlspecialchars($p['code_lang'] ?? 'php', ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($p['code'], ENT_QUOTES, 'UTF-8'); ?></code></pre>
                            </div>
                        <?php endif; ?>
                    </article>
                <?php endforeach; ?>
            <?php endif; ?>
        </section>

        <!-- アクセスログの表示（view_logsが有効な場合のみ） -->
        
    </main>
    <!-- Prism.js 本体(markup, css, js 等込み)と、PHP用のコンポーネントのみをシンプルに読み込み -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup-templating.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-php.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-css-extras.min.js"></script>
    
    <script>
    // CSSの auto やフォント名などをカスタムトークンとして定義
    if (Prism.languages.css) {
        Prism.languages.css['custom-orange'] = /\b(?:auto|sans-serif|serif|monospace|cursive|fantasy|Arial|Helvetica|Meiryo)\b/i;
    }

    Prism.hooks.add('complete', function(env) {
        if (!env.element) return;
        // hrefやsrc属性の値（URL部分）に下線を付ける
        var attrNames = env.element.querySelectorAll('.token.attr-name');
        attrNames.forEach(function(el) {
            if (el.textContent === 'href' || el.textContent === 'src') {
                var next = el.nextElementSibling;
                if (next && next.classList.contains('attr-value')) {
                    // attr-valueの中のテキストノード（=" と " の間のURL文字列）を探す
                    next.childNodes.forEach(function(node) {
                        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
                            var span = document.createElement('span');
                            span.style.textDecoration = 'underline';
                            span.textContent = node.nodeValue;
                            next.replaceChild(span, node);
                        }
                    });
                }
            }
        });
    });

    Prism.hooks.add('wrap', function(env) {
        if (env.type === 'keyword' || env.type === 'function' || env.type === 'builtin') {
            if (env.content === 'const') {
                env.classes.push('keyword-const');
            } else if (['if', 'return', 'endif', 'isset', 'exit'].includes(env.content)) {
                env.classes.push('keyword-control');
            }
        } else if (env.type === 'punctuation') {
            if (['(', ')', '{', '}', '[', ']'].includes(env.content)) {
                env.classes.push('punctuation-bracket');
            }
        }
    });

    function copyCode(btn) {
        // ボタンの親(code-header)の次にある兄弟要素(pre)を取得
        var pre = btn.parentElement.nextElementSibling;
        var code = pre.innerText;
        navigator.clipboard.writeText(code).then(function() {
            var originalText = btn.innerText;
            btn.innerText = 'Copied!';
            setTimeout(function() {
                btn.innerText = originalText;
            }, 2000);
        }).catch(function(err) {
            console.error('コピーに失敗しました', err);
        });
    }
    </script>
    <script>
    // SPA風のタグ切り替えロジック
    document.addEventListener('DOMContentLoaded', function() {
        const tagLinks = document.querySelectorAll('.tag-link');
        const articles = document.querySelectorAll('.post-article');

        function switchTag(selectedTag, updateHistory = true) {
            let tagFound = false;
            // アクティブなタグのスタイリングを更新
            tagLinks.forEach(l => {
                if (l.getAttribute('data-tag') === selectedTag) {
                    l.classList.add('active-tag');
                    l.style.fontWeight = 'bold';
                    l.style.pointerEvents = 'none';
                    l.style.color = 'var(--pico-color)';
                    tagFound = true;
                } else {
                    l.classList.remove('active-tag');
                    l.style.fontWeight = 'normal';
                    l.style.pointerEvents = 'auto';
                    l.style.color = '';
                }
            });

            // 記事の表示/非表示を切り替え
            let visibleCount = 0;
            articles.forEach(article => {
                const tagsStr = article.getAttribute('data-tags');
                if (tagsStr) {
                    try {
                        const tags = JSON.parse(tagsStr);
                        if (tags.includes(selectedTag)) {
                            article.style.display = '';
                            visibleCount++;
                        } else {
                            article.style.display = 'none';
                        }
                    } catch(err) {
                        console.error('JSON parse error', err);
                    }
                }
            });

            // 記事が0件の場合のメッセージ制御
            const emptyMsg = document.getElementById('empty-message');
            if (emptyMsg) {
                emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
            }

            // URLの更新
            if (updateHistory) {
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('tag', selectedTag);
                window.history.pushState({ tag: selectedTag }, '', newUrl);
            }
        }

        // 初期表示時の処理
        const urlParams = new URLSearchParams(window.location.search);
        let initialTag = urlParams.get('tag');
        
        // PHPで出力されたデフォルトタグを取得（DOMから判定）
        const defaultActiveLink = document.querySelector('.tag-link.active-tag');
        const defaultTag = defaultActiveLink ? defaultActiveLink.getAttribute('data-tag') : null;

        if (initialTag && initialTag !== defaultTag) {
            let tagExists = Array.from(tagLinks).some(l => l.getAttribute('data-tag') === initialTag);
            if (tagExists) {
                switchTag(initialTag, false);
            } else {
                // 存在しないタグの場合はURLのクエリを削除してデフォルト表示を維持
                const newUrl = new URL(window.location);
                newUrl.searchParams.delete('tag');
                window.history.replaceState(null, '', newUrl);
            }
        } else if (!initialTag && defaultTag) {
            // クエリなしの場合はデフォルトタグをURLに反映 (ブラウザリロード等の共有用)
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('tag', defaultTag);
            window.history.replaceState({ tag: defaultTag }, '', newUrl);
        }

        tagLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const selectedTag = this.getAttribute('data-tag');
                switchTag(selectedTag, true);
            });
        });

        window.addEventListener('popstate', function(e) {
            if (e.state && e.state.tag) {
                switchTag(e.state.tag, false);
            } else {
                const currentUrlParams = new URLSearchParams(window.location.search);
                const currentTag = currentUrlParams.get('tag') || defaultTag;
                if (currentTag) {
                    switchTag(currentTag, false);
                }
            }
        });
    });
    </script>
</body>
</html>
