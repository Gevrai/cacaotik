.PHONY: dev start install

dev:
	node scripts/dev.js

start:
	node server.js

install:
	npm install
