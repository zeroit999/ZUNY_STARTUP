LANGUAGES = {
    "CPP23": {
        "source_file": "main.cpp",
        "compile": [
            "g++",
            "-std=c++23",
            "-O2",
            "-pipe",
            "-I/opt/zuny-pch",
            "-o",
            "/workspace/main",
            "/workspace/main.cpp",
        ],
        "run": [
            "/workspace/main",
        ],
    },

    "PYTHON314": {
        "source_file": "main.py",
        "compile": None,
        "run": [
            "python3.14",
            "-I",
            "-B",
            "/workspace/main.py",
        ],
    },


}


def get_language(language):
    return LANGUAGES.get(
        str(language or "").upper()
    )
