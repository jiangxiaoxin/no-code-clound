#!/usr/bin/env node
/**
 * 统计项目内 .js / .ts / .vue 代码行数
 *
 * 用法（在项目根目录执行）:
 *   node shared/count-loc.js
 *   node shared/count-loc.js --roots front/src server/src
 *   node shared/count-loc.js --json
 */

const fs = require('fs')
const path = require('path')

const EXTENSIONS = new Set(['.js', '.ts', '.vue'])
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.worktrees',
  '.cursor',
  '.superpowers',
])

function parseArgs(argv) {
  const args = {
    roots: ['front/src', 'server/src'],
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      args.json = true
    } else if (arg === '--roots') {
      args.roots = argv.slice(i + 1).filter((item) => !item.startsWith('--'))
      break
    }
  }
  return args
}

function countFileLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  let total = lines.length
  let blank = 0
  let comment = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      blank += 1
      continue
    }
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*/')
    ) {
      comment += 1
    }
  }

  return {
    total,
    blank,
    comment,
    code: total - blank - comment,
  }
}

function walkDir(dir, onFile) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue
      }
      walkDir(fullPath, onFile)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (!EXTENSIONS.has(ext)) {
      continue
    }
    onFile(fullPath, ext)
  }
}

function emptyBucket() {
  return { files: 0, total: 0, blank: 0, comment: 0, code: 0 }
}

function addTo(bucket, stat) {
  bucket.files += 1
  bucket.total += stat.total
  bucket.blank += stat.blank
  bucket.comment += stat.comment
  bucket.code += stat.code
}

function formatRow(label, bucket) {
  return [
    label.padEnd(14),
    String(bucket.files).padStart(6),
    String(bucket.total).padStart(8),
    String(bucket.code).padStart(8),
    String(bucket.blank).padStart(8),
    String(bucket.comment).padStart(8),
  ].join(' ')
}

function main() {
  const { roots, json } = parseArgs(process.argv.slice(2))
  const root = process.cwd()

  const byExt = Object.fromEntries(
    [...EXTENSIONS].map((ext) => [ext, emptyBucket()]),
  )
  const byRoot = {}
  const total = emptyBucket()

  for (const relRoot of roots) {
    const absRoot = path.join(root, relRoot)
    byRoot[relRoot] = emptyBucket()

    walkDir(absRoot, (filePath, ext) => {
      const stat = countFileLines(filePath)
      addTo(byExt[ext], stat)
      addTo(byRoot[relRoot], stat)
      addTo(total, stat)
    })
  }

  if (json) {
    console.log(JSON.stringify({ roots, byExt, byRoot, total }, null, 2))
    return
  }

  console.log('代码行统计 (.js / .ts / .vue)')
  console.log(`工作目录: ${root}`)
  console.log(`扫描范围: ${roots.join(', ')}`)
  console.log('')
  console.log(
    [
      '分类'.padEnd(14),
      '文件数'.padStart(6),
      '总行数'.padStart(8),
      '代码行'.padStart(8),
      '空行'.padStart(8),
      '注释行'.padStart(8),
    ].join(' '),
  )
  console.log('-'.repeat(58))

  for (const ext of [...EXTENSIONS].sort()) {
    console.log(formatRow(ext, byExt[ext]))
  }

  console.log('-'.repeat(58))
  for (const relRoot of roots) {
    console.log(formatRow(relRoot, byRoot[relRoot]))
  }
  console.log('-'.repeat(58))
  console.log(formatRow('合计', total))
}

main()
