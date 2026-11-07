import { Router } from 'express'
import multer from 'multer'
import { deleteFile, downloadOwnFile, getFile, listFiles, uploadFile } from '../controllers/fileController.js'
import { requireFrontendOrigin } from '../middleware/requireFrontendOrigin.js'
import { uploadSingleFile } from '../services/fileStorage.js'
import { httpError } from '../utils/httpError.js'

const fileRoutes = Router()

function parseUpload(request, response, next) {
  uploadSingleFile(request, response, (error) => {
    if (!error) return next()
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(httpError(413, 'Files must be 10 MB or smaller.'))
      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') return next(httpError(400, 'Choose one file at a time.'))
      return next(httpError(400, 'The upload could not be processed.'))
    }
    return next(error)
  })
}

fileRoutes.post('/upload', requireFrontendOrigin, parseUpload, uploadFile)
fileRoutes.get('/', listFiles)
fileRoutes.get('/:id/download', downloadOwnFile)
fileRoutes.get('/:id', getFile)
fileRoutes.delete('/:id', requireFrontendOrigin, deleteFile)

export default fileRoutes
