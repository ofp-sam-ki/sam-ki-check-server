rmdir /s /q binaries 
pkg --out-path binaries --compress GZip index.js -t node18-win-x64,node18-linux-x64