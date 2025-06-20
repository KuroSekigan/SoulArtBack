# Usa una imagen oficial de Node.js
FROM node:20

# Crea el directorio de trabajo
WORKDIR /app

# Copia las claves SSH si necesitas clonar un repositorio privado
COPY ssh/id_rsa /root/.ssh/id_rsa
RUN chmod 600 /root/.ssh/id_rsa
COPY ssh/id_rsa.pub /root/.ssh/id_rsa.pub
RUN chmod 644 /root/.ssh/id_rsa.pub

# Agrega GitHub a known_hosts para evitar advertencias al clonar
RUN mkdir -p /root/.ssh && \
    ssh-keyscan github.com >> /root/.ssh/known_hosts

# Clona tu repositorio privado de Express
RUN git clone git@github.com:KuroSekigan/SoulArtBack.git /app \
    && git config --global --add safe.directory /app \
    && cd /app && git checkout Kuro \
    && git pull

# Instala dependencias
RUN cd /app && npm install

# Expón el puerto donde Express corre (por defecto es 3000)
EXPOSE 3000

# Comando para iniciar la app
CMD ["npm", "start"]
