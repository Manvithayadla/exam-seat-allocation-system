import mysql.connector
import os


def get_db_connection():
    connection = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.getenv("DB_PASSWORD"),
        database="smart_exam_db"
    )

    return connection
