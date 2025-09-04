import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { minify } from 'html-minifier-terser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const targetPath = path.resolve(__dirname, '../dist/index.html')

async function run() {
  try {
    const input = await readFile(targetPath, 'utf8')
    const output = await minify(input, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      keepClosingSlash: true,
      useShortDoctype: true,
      minifyJS: true,
      minifyCSS: true,
      sortAttributes: true,
      sortClassName: true,
    })
    await writeFile(targetPath, output, 'utf8')
    console.log('Minified dist/index.html')
  } catch (err) {
    console.error('HTML minification failed:', err)
    process.exitCode = 1
  }
}

run()
