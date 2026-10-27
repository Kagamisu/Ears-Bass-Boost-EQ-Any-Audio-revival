# Проверка упаковки 1.3.14

Установочная директория — extension. Команда python tools/build.py создаёт Ears-Revival-1.3.14-local.zip и Ears-Revival-1.3.14-source.zip рядом с проектом. Проверяются CRC архивов; manifest лежит в корне установочного ZIP. В упаковку не входят .git, node_modules, work и permissions-private. Контрольные суммы находятся в SHA256SUMS.txt рядом с ZIP.

GitHub Actions выполняет проверку упаковки. Актуальные runtime-хеши находятся в runtime-sha256.json. Путь --public остаётся отдельной подготовкой магазинного пакета.
