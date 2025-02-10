rmdir /s /q binaries 
set NODE_NODEGYP_DISABLE_BYTECODE=1
pkg --out-path binaries --compress GZip index.js -t node18-win-x64,node18-linux-x64