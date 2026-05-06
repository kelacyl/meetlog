import path from 'path'
import fs from 'fs'
import { app } from 'electron'

interface MeetingRecord {
  id: number
  title: string
  createdAt: number
  duration: number
  transcript: string
  summary: string
  audioPath: string
}

interface LicenseUsageRecord {
  yearMonth: string
  count: number
}

interface Database {
  meetings: MeetingRecord[]
  config: Record<string, string>
  licenseUsage: LicenseUsageRecord[]
  nextId: number
}

let dbPath: string = ''
let data: Database = {
  meetings: [],
  config: {},
  licenseUsage: [],
  nextId: 1,
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadDatabase() {
  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf-8')
      data = JSON.parse(raw)
    } catch {
      data = { meetings: [], config: {}, licenseUsage: [], nextId: 1 }
    }
  }
}

function saveDatabase() {
  ensureDir(dbPath)
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function initDatabase(archivePath?: string) {
  const dataDir = archivePath || path.join(app.getPath('userData'), 'meetlog')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  dbPath = path.join(dataDir, 'meetlog.json')
  loadDatabase()
}

export function closeDatabase() {
  saveDatabase()
}

export function getMeetings(): MeetingRecord[] {
  return [...data.meetings].sort((a, b) => b.createdAt - a.createdAt)
}

export function getMeeting(id: number): MeetingRecord | undefined {
  return data.meetings.find((m) => m.id === id)
}

export function saveMeeting(meeting: Omit<MeetingRecord, 'id'>): number {
  const id = data.nextId++
  data.meetings.push({ ...meeting, id })
  saveDatabase()
  return id
}

export function updateMeeting(id: number, partial: Partial<MeetingRecord>) {
  const idx = data.meetings.findIndex((m) => m.id === id)
  if (idx !== -1) {
    data.meetings[idx] = { ...data.meetings[idx], ...partial }
    saveDatabase()
  }
}

export function deleteMeeting(id: number) {
  const idx = data.meetings.findIndex((m) => m.id === id)
  if (idx !== -1) {
    const meeting = data.meetings[idx]
    if (meeting.audioPath && fs.existsSync(meeting.audioPath)) {
      fs.unlinkSync(meeting.audioPath)
    }
    data.meetings.splice(idx, 1)
    saveDatabase()
  }
}

export function getConfigValue(key: string): string | undefined {
  return data.config[key]
}

export function setConfigValue(key: string, value: string) {
  data.config[key] = value
  saveDatabase()
}

export function getLicenseUsage(yearMonth: string): number {
  const record = data.licenseUsage.find((r) => r.yearMonth === yearMonth)
  return record?.count || 0
}

export function incrementLicenseUsage(yearMonth: string) {
  const record = data.licenseUsage.find((r) => r.yearMonth === yearMonth)
  if (record) {
    record.count++
  } else {
    data.licenseUsage.push({ yearMonth, count: 1 })
  }
  saveDatabase()
}
