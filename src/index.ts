import type { Gist, ProjectInfo } from "./types.js"
import fs from "fs"
import path from "path"
import { projectInfo } from './info.js'
import { replaceMyApp } from "./utils.js"

export async function cli(args:string[]) {
  const text = args.join(' ').trim()
  if (text === 'init') {
    let info = {}
    try {
      info = projectInfo(process.cwd())
    } catch (err) {
      info = {
        projectName: "",
        sln: "",
        slnDir: "",
        hostDir: "",
        migrationsDir: "",
        serviceModelDir: "",
        serviceInterfaceDir: "",
      }
    }
    fs.writeFileSync('okai.json', JSON.stringify(info, undefined, 2))
    process.exit(0)
  }
  if (!text || text === '?' || text === 'help') {
    console.log(`Usage: 
okcs init      - Initialize okcs.json with project info to override default paths`)
    process.exit(0)
    return
  }
  
  const baseUrl = process.env.OKAI_URL || 'https://okai.servicestack.com'

  try {
    const info = projectInfo(process.cwd())
    if (!info.serviceModelDir) throw new Error("Could not find ServiceModel directory")
  } catch (err) {
    console.error(err)
  }
}

async function fetchGistFiles(baseUrl:string, text:string) {
  const url = new URL('/gist', baseUrl)
  if (process.env.OKAI_CACHED) {
    url.searchParams.append('cached', `1`)
  }
  url.searchParams.append('text', text)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to generate files: ${res.statusText}`)
  }
  const gist = await res.json()
  const files = gist.files
  if (!files || Object.keys(files).length === 0) {
    throw new Error(`Request didn't generate any files`)
  }
  return gist as Gist
}

function convertToProjectGist(info: ProjectInfo, gist: Gist) {
  const to = Object.assign({}, gist, { files: {} })
  const cwd = process.cwd()
  for (const [fileName, file] of Object.entries(gist.files)) {
    if (fileName.startsWith('MyApp.ServiceModel/') && info.serviceModelDir) {
      const fullPath = path.join(info.serviceModelDir, file.filename.substring('MyApp.ServiceModel/'.length))
      const relativePath = path.relative(cwd, fullPath)
      to.files[relativePath] = {
        filename: path.basename(fullPath),
        content: replaceMyApp(gist.files[fileName].content, info.projectName)
      }

    } else if (fileName.startsWith('MyApp/Migrations/') && info.migrationsDir) {
      const fullPath = path.join(info.migrationsDir, file.filename.substring('MyApp.Migrations/'.length))
      const relativePath = path.relative(cwd, fullPath)
      to.files[relativePath] = Object.assign({}, file, {
        filename: path.basename(fullPath),
        content: replaceMyApp(gist.files[fileName].content, info.projectName)
      })
    } else {
      const fullPath = path.join(info.slnDir, file.filename)
      const relativePath = path.relative(cwd, fullPath)
      const toFilename = replaceMyApp(relativePath, info.projectName)
      to.files[relativePath] = Object.assign({}, file, {
        filename: path.basename(toFilename),
        content: replaceMyApp(file.content, info.projectName)
      })
    }
  }
  return to
}

function writeFile(info:ProjectInfo, filename: string, content:string) {
  let fullPath = path.join(process.cwd(), filename)
  const dir = path.dirname(fullPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (fs.existsSync(fullPath)) {
    const filename = path.basename(fullPath)
    const ext = path.extname(filename)
    const baseName = path.basename(filename, ext)
    // filename: Migration1000.cs, baseName: Migration1000, ext: .cs
    // console.log(`File already exists: ${fullPath}`, { filename, baseName, ext })
    const numberedFile = baseName.match(/(\d+)$/)
    if (numberedFile) {
      let nextNumber = parseInt(numberedFile[1])
      while (fs.existsSync(fullPath)) {
        if (numberedFile) {
          nextNumber += 1
          fullPath = path.join(dir, `${baseName.replace(/\d+$/, '')}${nextNumber}${ext}`)
        }
      }
      const renamedFile = `${baseName.replace(/\d+$/, '')}${nextNumber}`
      content = content.replaceAll(baseName, renamedFile)
    }
  }
  fs.writeFileSync(fullPath, content)
}
