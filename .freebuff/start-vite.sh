#!/bin/bash
export PATH="/Users/yudhistherkumar/.nvm/versions/node/v26.1.0/bin:$PATH"
cd /Users/yudhistherkumar/Downloads/goWMS/web
exec node ./node_modules/.bin/vite --port 5173 --host 0.0.0.0
