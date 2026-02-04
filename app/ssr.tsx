import { getRouter } from './router'
import { createStartHandler } from '@tanstack/react-start/server'

export default createStartHandler({ getRouter })
