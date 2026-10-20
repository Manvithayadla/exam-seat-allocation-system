import mysql.connector


def get_db_connection():
    connection = mysql.connector.connect(
        host="localhost",
        user="root",
        password="Manvi@2326",
        database="smart_exam_db"
    )

    return connection