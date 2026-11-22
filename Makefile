.PHONY: install dev build serve

install:
	npm install

dev:
	npm run dev

build:
	npm run build

serve: build
	npx serve out -l 3100
