.PHONY: build lint test test-backend test-frontend

build:
	npm run build

lint:
	npm run lint

test:
	npm test

test-backend:
	npm run test:backend

test-frontend:
	npm run test:frontend
