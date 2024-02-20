# Choose the Image which has Node installed already
FROM node:lts-alpine

RUN npm install --global nodemon

# make the 'app' folder the current working directory
WORKDIR /app

# copy both 'package.json' and 'package-lock.json' (if available)
COPY package*.json ./

# install project dependencies
RUN npm install

#RUN export NODE_OPTIONS=--openssl-legacy-provider

# copy project files and folders to the current working directory (i.e. 'app' folder)
COPY . .

# build app for production with minification
#RUN npm run build

EXPOSE 4000
CMD [ "npm", "start" ]