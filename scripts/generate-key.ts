/**
 * MeetLog Assistant - 序列码生成工具（开发者专用）
 *
 * 用法: npx ts-node scripts/generate-key.ts
 *
 * 生成两种序列码:
 *   1. 万能密钥   - 不绑机器, 可在任何电脑上激活
 *   2. 机器绑定码 - 仅在指定机器上有效 (需要用户提供机器 ID)
 *
 * ⚠️ 请妥善保管 MASTER_SECRET，不要提交到代码仓库或泄露给他人。
 */

import crypto from 'crypto'
import readline from 'readline'

// ─── ⚠️ 修改此处为你的专属密钥（不要提交到 Git） ──────────────────
const MASTER_SECRET = 'meetlog-dev-secret-change-me-2026'
// ──────────────────────────────────────────────────────────────────

function generateUniversalKey(index: number): {
  key: string
  hash: string
  codeHash: string
} {
  // Derive key from master secret + index
  const derived = crypto
    .createHmac('sha256', MASTER_SECRET)
    .update(`universal-key-v1-${index}`)
    .digest('hex')
  const code = derived.substring(0, 16).toUpperCase()
  const formatted = `${code.substring(0, 4)}-${code.substring(4, 8)}-${code.substring(8, 12)}-${code.substring(12, 16)}`

  // The hash that should be added to the app's VALID_KEY_HASHES
  const hash = crypto.createHash('sha256').update(formatted).digest('hex')

  return { key: formatted, hash, codeHash: hash }
}

function generateMachineKey(machineId: string): string {
  // Same algorithm as in electron/license.ts
  const hash = crypto
    .createHash('sha256')
    .update(`${machineId}:meetlog-secret-v1-2026`)
    .digest('hex')
  const code = hash.substring(0, 16).toUpperCase()
  return `${code.substring(0, 4)}-${code.substring(4, 8)}-${code.substring(8, 12)}-${code.substring(12, 16)}`
}

// ─── Interactive CLI ──────────────────────────────────────────────

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   MeetLog Assistant - 序列码生成工具          ║')
  console.log('║   开发者专用, 请勿外传                        ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log('')

  console.log('请选择生成类型:')
  console.log('  1. 万能密钥 (不限机器, 推荐)')
  console.log('  2. 机器绑定码 (需提供用户机器 ID)')
  console.log('  3. 批量生成万能密钥 (10 个)')
  console.log('')

  const choice = await question(rl, '请输入选项 (1/2/3): ')

  if (choice === '1') {
    const index = parseInt(await question(rl, '密钥编号 (1-9999): '), 10)
    const result = generateUniversalKey(index)

    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  序列码:  ${result.key}`)
    console.log(`  Hash:   ${result.hash}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('将该序列码发给用户，用户可在"系统设置→序列码激活"中输入使用。')
    console.log('')
    console.log('⚠️ 如果 app 尚未包含此密钥的 Hash，将无法验证。')
    console.log(`   请将以下 Hash 添加到 electron/license.ts 的 VALID_KEY_HASHES 数组中:`)
    console.log(`   "${result.hash}"`)
  } else if (choice === '2') {
    const machineId = await question(rl, '用户机器 ID: ')
    const key = generateMachineKey(machineId.trim())

    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  机器绑定码:  ${key}`)
    console.log(`  适用机器 ID: ${machineId.trim()}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('该序列码仅能在上述机器 ID 的电脑上使用。')
  } else if (choice === '3') {
    const startIndex = parseInt(await question(rl, '起始编号 (1-9990): '), 10)

    console.log('')
    console.log('批量生成的万能密钥:')
    console.log('┌──────┬──────────────────────┬──────────────────────────────────────────────┐')
    console.log('│ 编号 │ 序列码               │ Hash (需添加到 VALID_KEY_HASHES)              │')
    console.log('├──────┼──────────────────────┼──────────────────────────────────────────────┤')

    const hashes: string[] = []
    for (let i = 0; i < 10; i++) {
      const idx = startIndex + i
      const result = generateUniversalKey(idx)
      console.log(`│ ${String(idx).padStart(4)} │ ${result.key} │ ${result.hash} │`)
      hashes.push(result.hash)
    }

    console.log('└──────┴──────────────────────┴──────────────────────────────────────────────┘')
    console.log('')
    console.log('将所有 Hash 添加到 electron/license.ts 的 VALID_KEY_HASHES 数组中:')
    console.log('')
    hashes.forEach((h) => console.log(`  "${h}",`))
  } else {
    console.log('无效选项')
  }

  rl.close()
}

main().catch(console.error)
