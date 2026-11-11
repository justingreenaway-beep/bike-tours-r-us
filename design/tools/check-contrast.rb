# Checks every contrast pair listed in DESIGN.md (section 2.6) against the hex values in design/tokens.css.
# For each row it works out the WCAG 2.x ratio in light and dark, checks it meets the row's "Needs" value,
# and checks the ratios written in DESIGN.md match tokens.css (to 0.01).
# Run from the repo root:   ruby design/tools/check-contrast.rb
# Writes design/contrast-report.txt and exits 1 if anything fails. Plain Ruby, no gems.

root = File.expand_path('../..', __dir__)
design = File.read(File.join(root, 'DESIGN.md'), encoding: 'utf-8')
tokens = File.read(File.join(root, 'design', 'tokens.css'), encoding: 'utf-8')

def block(css, start)
  i = css.index(start) or abort "tokens.css: can't find #{start}"
  i = css.index('{', i) + 1
  depth = 1; j = i
  while depth > 0
    depth += 1 if css[j] == '{'
    depth -= 1 if css[j] == '}'
    j += 1
  end
  css[i...j - 1]
end
def vars(src)
  src.scan(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\b/).map { |k, v| [k, v.upcase] }.to_h
end

light = vars(block(tokens, ':root {'))
dark = light.merge(vars(block(tokens, ':root[data-theme="dark"]')))

def lum(hex)
  c = [1, 3, 5].map { |i| v = hex[i, 2].to_i(16) / 255.0; v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055)**2.4 }
  0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
end
def ratio(a, b)
  l1, l2 = [lum(a), lum(b)].sort.reverse
  (l1 + 0.05) / (l2 + 0.05)
end
def find(t, name)
  ["color-#{name}", name, "status-#{name}"].each { |k| return t[k] if t[k] }
  nil
end

rows = design.scan(/^\| `([a-z0-9-]+)` on `([a-z0-9-]+)` \| ([^|]+)\| ([\d.]+):1 \| ([\d.]+):1 \| ([\d.]+):1 \|$/)
abort 'DESIGN.md: no contrast rows found' if rows.empty?

out = []
fails = 0
out << "Contrast check: #{rows.size} pairs from DESIGN.md section 2.6, values from design/tokens.css"
out << "WCAG 2.x relative luminance. Light = :root, dark = :root[data-theme=\"dark\"]."
out << ''
out << format('%-46s %10s %10s %6s  %s', 'Pair', 'Light', 'Dark', 'Needs', 'Result')
out << '-' * 86
rows.each do |fg, bg, _use, sl, sd, need|
  lf, lb, df, db = find(light, fg), find(light, bg), find(dark, fg), find(dark, bg)
  if [lf, lb, df, db].any?(&:nil?)
    out << format('%-46s %s', "#{fg} on #{bg}", 'FAIL: token missing in tokens.css'); fails += 1; next
  end
  l = ratio(lf, lb); d = ratio(df, db); n = need.to_f
  problems = []
  problems << "light #{l.round(2)} < #{n}" if l < n
  problems << "dark #{d.round(2)} < #{n}" if d < n
  problems << "DESIGN.md says light #{sl}" if (l.round(2) - sl.to_f).abs > 0.011
  problems << "DESIGN.md says dark #{sd}" if (d.round(2) - sd.to_f).abs > 0.011
  fails += 1 unless problems.empty?
  out << format('%-46s %8.2f:1 %8.2f:1 %4s:1  %s', "#{fg} on #{bg}", l, d, need, problems.empty? ? 'pass' : 'FAIL: ' + problems.join('; '))
end
out << ''
# the dark values appear twice (prefers-color-scheme and data-theme="dark"): they must match
auto_dark = vars(block(tokens, ':root:not([data-theme="light"])'))
forced_dark = vars(block(tokens, ':root[data-theme="dark"]'))
diff = (auto_dark.keys | forced_dark.keys).reject { |k| auto_dark[k] == forced_dark[k] }
if diff.empty?
  out << "Dark blocks match: #{forced_dark.size} colour tokens are the same under prefers-color-scheme and data-theme=\"dark\"."
else
  fails += 1
  out << "FAIL: dark blocks differ for #{diff.join(', ')}"
end
out << ''
out << (fails.zero? ? "All #{rows.size} pairs pass in both themes." : "#{fails} of #{rows.size} pairs FAIL.")
report = out.join("\n") + "\n"
File.write(File.join(root, 'design', 'contrast-report.txt'), report)
puts report
exit(fails.zero? ? 0 : 1)
