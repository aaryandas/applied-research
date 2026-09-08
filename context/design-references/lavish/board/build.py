import re, pathlib
ROOT = pathlib.Path('/Users/aaryan/.superset/projects/capstone')
B = ROOT/'.lavish/board'
idx = (B/'index.html').read_text()

# ---------- A: Claude Design screens ----------
src = (ROOT/'docs/designs/Design System Canvas Setup/Applied Research - Screens.dc.html').read_text()
st = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
st = st.replace('body{', '.ar-a{', 1).replace('::selection{', '.ar-a ::selection{').replace('\na{', '\n.ar-a a{').replace('a:hover{', '.ar-a a:hover{')
secs = re.findall(r'(<section id="(s\d+)" data-screen-label="([^"]*)".*?</section>)', src, re.S)
assert len(secs) == 28, len(secs)
nav = ' '.join(f'<a href="#{sid}">{sid[1:]} {lab.split(" · dark")[0].split(" · light")[0]}{" ☀" if "light" in lab else ""}</a>' for _, sid, lab in secs)
a_html = f'''<style>{st}
.ar-a section{{zoom:var(--za,.6);margin:0 0 40px}} .ar-a{{padding:24px;border-radius:8px;overflow-x:auto}}
.jump{{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin:8px 0 14px}} .jump a{{color:#333;text-decoration:none;border-bottom:1px dotted #999}}
.ctl{{display:flex;gap:10px;align-items:center;font-size:12px;color:#555;margin:0 0 10px}}</style>
<div class="ctl">Scale <input type="range" min=".35" max="1" step=".05" value=".6" oninput="document.querySelector('.ar-a').style.setProperty('--za',this.value);this.nextElementSibling.textContent=Math.round(this.value*100)+'%'"><span>60%</span> · every element inside a screen is clickable</div>
<div class="jump">{nav}</div>
<div class="ar-a">{"".join(h for h,_,_ in secs)}</div>'''

# ---------- B: Field Atlas ----------
fa = ROOT/'design-system'
html = (fa/'index.html').read_text()
body = re.search(r'<a class="skip-link".*?</main>(.*?)<script|<a class="skip-link".*?(?=<script)', html, re.S)
body = html[html.find('<a class="skip-link"'):html.rfind('</body>')]
body = re.sub(r'<script[^>]*></script>', '', body)
body = body.replace('id="main"', 'id="fa-main"')
body = re.sub(r'(<section id="panel-(?:workbench|playbook)"[^>]*?) hidden>', r'\1>', body)
ws = re.search(r'<section id="workspace".*?</section>\s*(?=<section id="foundations")', body, re.S).group(0)
body = body.replace(ws, ws + '<div data-theme="dark" class="fa-evening"><p class="fa-lab">Same workspace · evening</p>' + ws + '</div>', 1)
tok = (fa/'tokens.css').read_text().replace(':root {', '.ar-b {').replace("[data-theme='dark'] {", ".ar-b[data-theme='dark'], .ar-b [data-theme='dark'] {")
css = (fa/'styles.css').read_text()
css = re.sub(r"url\(['\"]?assets/", lambda m: m.group(0).replace('assets/', 'live/field-atlas/assets/'), css)
# hoist @keyframes
kf = re.findall(r'@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}', css)
for k in kf: css = css.replace(k, '')
css = re.sub(r'^html \{[^}]*\}\n', '', css, flags=re.M)
css = css.replace('\nbody {', '\n& {', 1).replace('html,textarea,dialog', 'textarea,dialog')
b_html = f'''<style>{tok}
{"".join(kf)}
.ar-b {{
{css}
.site-header{{position:static}} .skip-link{{display:none}} .hero{{height:auto;min-height:560px}}
.fa-evening{{background:var(--paper);color:var(--ink)}} .fa-lab{{margin:0;padding:14px 24px 0;font:600 12px/1 var(--font-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}}
}}</style>
<div class="ar-b" lang="en">{body}</div>
<script src="live/field-atlas/app.board.js" defer></script>'''
(B/'live/field-atlas/app.board.js').write_text((fa/'app.js').read_text().replace('document.documentElement.dataset.theme', "document.querySelector('.ar-b').dataset.theme").replace("$(`#panel-${tab.dataset.view}`).hidden = !selected;","/* board: all panels stay visible */"))

# ---------- splice into board ----------
new_row = f'''<section class="row" id="rebuilt">
  <div class="row-h"><h2>02 · Screens, rebuilt live</h2><p>the actual markup of each system — click any component, word, or control</p></div>
  <div class="card" style="margin-bottom:28px"><div class="lane-h" style="margin-bottom:10px"><span class="tag">A</span><strong>Lamp &amp; Margin · 28 artboards from the Screens canvas</strong></div>
  {a_html}</div>
  <div class="card"><div class="lane-h" style="margin-bottom:10px"><span class="tag">B</span><strong>Field Atlas · the reference site itself, all three workspace panels expanded, plus an evening copy</strong></div>
  <div style="border:1px solid #ddd;border-radius:6px;overflow:hidden">{b_html}</div></div>
</section>
'''
marker = '<section class="row">\n  <div class="row-h"><h2>02 · Screens</h2>'
assert marker in idx
idx = idx.replace(marker, new_row + marker.replace('02 · Screens', '02b · Captures'), 1)
idx = re.sub(r'(?s)(<section class="row" id="rebuilt">.*?)</section>\n(<section class="row">\n  <div class="row-h"><h2>02b)', r'\1' + '' + r'</section>\n\2', idx)
(B/'index.html').write_text(idx)
print('ok', len(idx))
