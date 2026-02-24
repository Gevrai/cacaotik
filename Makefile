PROJECT  = cacaotik-gamejam
APP      = cacaotik
REGION   = northamerica-northeast1
IMAGE    = $(REGION)-docker.pkg.dev/$(PROJECT)/$(APP)/app

.PHONY: dev dev-mem dev-firestore start install init-deploy docker-auth docker-build docker-push deploy release emulator

# Dev with no persistence (fastest — no Firestore needed)
dev:
	node scripts/dev.js --no-firestore

# Dev with real Firestore credentials (production database)
dev-prod:
	node scripts/dev.js

# Dev connected to the local Firestore emulator (run `make emulator` in another terminal first)
dev-firestore:
	FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/dev.js

start:
	node server.js

install:
	npm install

# Run once on a new GCP account to create the project, enable APIs, and create the registry
init-deploy:
	gcloud projects create $(PROJECT) --name="Cacaotik" || true
	gcloud config set project $(PROJECT)
	gcloud services enable run.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com
	gcloud artifacts repositories create $(APP) \
		--repository-format=docker \
		--location=$(REGION) \
		--description="Cacaotik container images" || true
	gcloud firestore databases create --location=$(REGION) || true
	$(MAKE) docker-auth

# Start the Firestore emulator for local testing (requires gcloud beta + emulators component)
# Install once with: gcloud components install beta cloud-firestore-emulator
emulator:
	gcloud beta emulators firestore start --host-port=localhost:8080

# Run the dev server connected to the local Firestore emulator (run `make emulator` in another terminal first)
dev-firestore:
	FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/dev.js

# Run once to allow docker to push to GCP Artifact Registry
docker-auth:
	gcloud auth configure-docker $(REGION)-docker.pkg.dev

docker-build:
	docker build -t $(IMAGE) .

docker-push:
	docker push $(IMAGE)

deploy:
	gcloud run deploy cacaotik \
		--image $(IMAGE) \
		--region $(REGION) \
		--max-instances 1 \
		--min-instances 0 \
		--memory 256Mi \
		--timeout 3600 \
		--allow-unauthenticated

# Full release: build locally, push, deploy
release: docker-build docker-push deploy

# Delete the entire GCP project and all its resources
destroy-deployment:
	@echo "WARNING: This will delete the entire GCP project '$(PROJECT)' and all its resources."
	@read -p "Type the project name to confirm: " confirm && [ "$$confirm" = "$(PROJECT)" ] || (echo "Aborted." && exit 1)
	gcloud projects delete $(PROJECT)
